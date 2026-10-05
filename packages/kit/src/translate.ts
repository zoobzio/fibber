import type { Source, Translate, TranslateDocument } from "@fibber/translate";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { record } from "objectively";

import type { TranslateOutput, TranslateRunOptions, Translated } from "./types";
import { FILENAME, LOCK } from "./constant";
import { checkTranslation, compileSource, knownFormats } from "./contract";
import { checkDocument, listDocuments, readDocument } from "./documents";
import {
  InvalidConfigError,
  InvalidMessagesError,
  MissingTranslatorError,
} from "./error";
import { loadConfig } from "./load";
import { json } from "./print";
import { readTranslations } from "./read";
import { readSources } from "./sources";
import { validate } from "./validate";

/** What the lock records of one translation. */
interface Entry {
  /** The hash of the source message the translation was made from. */
  source: string;

  /** The hash of the translation as it was written. */
  translation: string;

  /**
   * Set on a translation a person wrote or edited. Such a translation is
   * never translated over: deleting it is how someone asks for a new one.
   */
  manual?: true;
}

/** What the lock records of one locale: its messages and its documents. */
interface Section {
  messages: Record<string, Entry>;
  documents: Record<string, Entry>;
}

/** The lock: every recorded translation, by locale. */
type Lock = Record<string, Section>;

/**
 * Loads `@fibber/translate`, the translators a run uses unless it is given
 * its own. An optional peer of the kit, imported only once a run is about to
 * call a model — building and checking never need it installed.
 */
const loadTranslators = async (): Promise<{
  translate: Translate;
  translateDocument: TranslateDocument;
}> => {
  try {
    return await import("@fibber/translate");
  } catch (error) {
    throw new MissingTranslatorError({ cause: error });
  }
};

/** A short, stable fingerprint of a message. */
const hash = (text: string): string => {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
};

/**
 * Reads the lock. A missing or unreadable lock, or an entry that is not one,
 * yields nothing — a translation with no record is treated as someone's own.
 */
const readLock = async (path: string): Promise<Lock> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
  const lock: Lock = {};
  if (!record(parsed)) {
    return lock;
  }
  const entries = (value: unknown): Record<string, Entry> => {
    const kept: Record<string, Entry> = {};
    if (!record(value)) {
      return kept;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (
        record(entry) &&
        typeof entry.source === "string" &&
        typeof entry.translation === "string"
      ) {
        kept[key] = {
          source: entry.source,
          translation: entry.translation,
          ...(entry.manual === true ? { manual: true } : {}),
        };
      }
    }
    return kept;
  };
  for (const [locale, section] of Object.entries(parsed)) {
    if (record(section)) {
      lock[locale] = {
        messages: entries(section.messages),
        documents: entries(section.documents),
      };
    }
  }
  return lock;
};

/**
 * Writes a file unless it already holds exactly this: a run with nothing to
 * translate leaves every file untouched, so nothing watching them stirs.
 */
const put = async (path: string, contents: string): Promise<void> => {
  let existing: string | undefined;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    // No file yet: written below.
  }
  if (existing !== contents) {
    await writeFile(path, contents);
  }
};

/** A record with its keys in the order `keys` gives, the rest after, sorted. */
const ordered = <T>(
  value: Record<string, T>,
  keys: string[],
): Record<string, T> => {
  const rest = Object.keys(value)
    .filter((key) => !keys.includes(key))
    .sort();
  const result: Record<string, T> = {};
  for (const key of [...keys, ...rest]) {
    if (Object.hasOwn(value, key)) {
      result[key] = value[key] as T;
    }
  }
  return result;
};

/**
 * Translates what a project has not translated yet: for each target locale,
 * the source messages with no translation, and the ones whose source changed
 * since they were translated. Everything else is left exactly as it is.
 *
 * A translation is written only once it is proven — it compiles, takes
 * nothing its source does not, and names only formats that exist — so
 * `fibber build` never fails on what this wrote. One that does not hold is
 * reported and left out, for the next run to ask for again.
 *
 * Human edits win. A translation with no record in the lock, or edited since
 * it was translated, is someone's own: it is never translated over, and when
 * its source changes it is kept and reported once. Deleting a translation is
 * how someone asks for a new one.
 *
 * Translations mirror the source: one `<locale>.json` for a source that is
 * a single file, `<locale>/<path>` for each file of a source directory.
 *
 * Content documents follow the messages. A document a locale lacks is
 * translated whole; one whose source changed is brought up to date from the
 * translation it has, so wording that still holds — a person's edits
 * included — comes back unchanged. A document is written only when its
 * front matter and code blocks survived.
 *
 * Each locale's files and the lock are written as that locale goes, so a
 * run that fails part-way keeps what it had done.
 *
 * With `check`, nothing is asked of a model and nothing is written: the run
 * only says, per locale, which messages and documents a real run would
 * translate — what a CI job fails on.
 *
 * @param options - The root, config path, locales, and the translator.
 * The options to translate by are the config's `translate`, unless the run
 * is given its own.
 *
 * @throws InvalidConfigError when the config breaks a rule, or names a
 * locale the config does not list.
 * @throws InvalidMessagesError when a source message does not compile.
 * @throws MissingTranslatorError when the run has to translate and
 * `@fibber/translate` is not installed.
 */
export const translate = async (
  options: TranslateRunOptions = {},
): Promise<TranslateOutput> => {
  const root = resolve(options.root ?? process.cwd());
  const settings = validate(
    await loadConfig(resolve(root, options.config ?? FILENAME)),
  );
  const check = options.check === true;
  const translateOptions = options.translate ?? settings.translate;
  if (
    options.translate !== undefined &&
    options.translate.model === undefined
  ) {
    throw new InvalidConfigError([
      "translate.model is required: a model from an AI SDK provider",
    ]);
  }
  if (translateOptions === undefined && !check) {
    throw new InvalidConfigError([
      "translate.model is required to translate: a model from an AI SDK provider",
    ]);
  }

  const targets = options.locales ?? settings.targets;
  const unknown = targets.filter(
    (locale) => !settings.targets.includes(locale),
  );
  if (unknown.length > 0) {
    throw new InvalidConfigError(
      unknown.map(
        (locale) =>
          `${JSON.stringify(locale)} is not a locale the config translates to`,
      ),
    );
  }

  const known = knownFormats(settings.formats);
  const { messages: source, chunks } = await readSources(root, settings);
  const contract = compileSource(source, known);
  const broken = Object.entries(contract.issues).flatMap(([key, issues]) =>
    issues.map(
      (issue) => `${settings.locale}: ${JSON.stringify(key)} ${issue}`,
    ),
  );
  if (broken.length > 0) {
    throw new InvalidMessagesError(broken);
  }
  const keys = Object.keys(contract.messages);

  const contentDir =
    settings.content === undefined
      ? undefined
      : resolve(root, settings.content);
  const sources: Record<string, string> = {};
  if (contentDir !== undefined) {
    for (const document of await listDocuments(contentDir)) {
      const text = await readDocument(contentDir, document);
      if (text !== undefined) {
        sources[document] = text;
      }
    }
  }

  // The default translators are loaded only for a run that may call them.
  const defaults =
    check ||
    (options.translator !== undefined &&
      options.documentTranslator !== undefined)
      ? undefined
      : await loadTranslators();
  const translator = options.translator ?? defaults?.translate;
  const documentTranslator =
    options.documentTranslator ?? defaults?.translateDocument;

  const directory = resolve(root, settings.translations);
  const lockPath = join(directory, LOCK);
  const lock = await readLock(lockPath);
  const output: TranslateOutput = {};

  for (const locale of targets) {
    const target = join(directory, locale);
    // Each source file's translations as its own file holds them, and all of
    // them together by full key.
    const held = new Map<string, Record<string, string> | undefined>();
    const translations: Record<string, string> = {};
    for (const chunk of chunks) {
      const file = await readTranslations(chunk.translation(locale));
      held.set(chunk.path, file);
      for (const [key, message] of Object.entries(file ?? {})) {
        translations[`${chunk.prefix}${key}`] = message;
      }
    }
    const section = lock[locale] ?? { messages: {}, documents: {} };
    const entries = section.messages;
    const records = section.documents;
    const outcome: Translated = {
      written: [],
      rejected: {},
      skipped: [],
      kept: [],
      pending: [],
      documents: { written: [], rejected: {}, pending: [] },
    };

    // The messages to ask for: the ones the locale lacks, and the machine
    // translations whose source has changed.
    const pending: Record<string, Source> = {};
    for (const key of keys) {
      const message = contract.messages[key];
      if (message === undefined) {
        continue;
      }
      const sourceHash = hash(message.source);
      const existing = Object.hasOwn(translations, key)
        ? translations[key]
        : undefined;
      const entry = Object.hasOwn(entries, key) ? entries[key] : undefined;

      if (existing !== undefined) {
        const manual =
          entry === undefined ||
          entry.manual === true ||
          entry.translation !== hash(existing);
        if (manual) {
          if (entry !== undefined && entry.source !== sourceHash) {
            outcome.kept.push(key);
          }
          entries[key] = {
            source: sourceHash,
            translation: hash(existing),
            manual: true,
          };
          continue;
        }
        if (entry?.source === sourceHash) {
          continue;
        }
      }
      pending[key] = {
        message: message.source,
        ...(message.description === undefined
          ? {}
          : { description: message.description }),
      };
    }

    // The documents to ask for: the ones the locale lacks, and the ones
    // whose source has changed — those with the translation they have.
    const stale: { document: string; source: string; existing?: string }[] = [];
    for (const [document, source] of Object.entries(sources)) {
      const sourceHash = hash(source);
      const existing = await readDocument(target, document);
      const entry = Object.hasOwn(records, document)
        ? records[document]
        : undefined;
      if (
        existing !== undefined &&
        (entry === undefined || entry.source === sourceHash)
      ) {
        // Someone's own, or current: recorded as it stands.
        records[document] = { source: sourceHash, translation: hash(existing) };
        continue;
      }
      stale.push({
        document,
        source,
        ...(existing === undefined ? {} : { existing }),
      });
    }

    // A check stops here: it says what a run would ask for, and writes
    // nothing — not even the lock.
    if (
      check ||
      translateOptions === undefined ||
      translator === undefined ||
      documentTranslator === undefined
    ) {
      outcome.pending = Object.keys(pending);
      outcome.documents.pending = stale.map(({ document }) => document);
      output[locale] = outcome;
      continue;
    }

    const answers =
      Object.keys(pending).length === 0
        ? {}
        : await translator(
            { source: settings.locale, target: locale, messages: pending },
            translateOptions,
          );

    for (const key of Object.keys(pending)) {
      const message = contract.messages[key];
      const answer = Object.hasOwn(answers, key) ? answers[key] : undefined;
      if (message === undefined || answer === undefined) {
        outcome.skipped.push(key);
        continue;
      }
      const checked = checkTranslation(answer, message, known);
      if (!checked.ok) {
        outcome.rejected[key] = checked.issues;
        continue;
      }
      translations[key] = answer;
      entries[key] = {
        source: hash(message.source),
        translation: hash(answer),
      };
      outcome.written.push(key);
    }

    // The lock only speaks for translations that exist.
    for (const key of Object.keys(entries)) {
      if (!Object.hasOwn(translations, key)) {
        delete entries[key];
      }
    }
    await mkdir(directory, { recursive: true });
    for (const chunk of chunks) {
      const file = { ...held.get(chunk.path) };
      for (const key of chunk.keys) {
        const full = `${chunk.prefix}${key}`;
        if (Object.hasOwn(translations, full)) {
          file[key] = translations[full] as string;
        }
      }
      // A file of a source directory with nothing translated is not written;
      // a single source's one translations file always is.
      if (
        chunk.prefix !== "" &&
        held.get(chunk.path) === undefined &&
        Object.keys(file).length === 0
      ) {
        continue;
      }
      const path = chunk.translation(locale);
      await mkdir(dirname(path), { recursive: true });
      await put(path, `${json(ordered(file, chunk.keys))}\n`);
    }

    for (const { document, source, existing } of stale) {
      const answer = await documentTranslator(
        {
          source: settings.locale,
          target: locale,
          path: document,
          document: source,
          ...(existing === undefined ? {} : { previous: existing }),
        },
        translateOptions,
      );
      const issues = checkDocument(source, answer);
      if (issues.length > 0) {
        outcome.documents.rejected[document] = issues;
        continue;
      }
      await mkdir(dirname(join(target, document)), { recursive: true });
      await writeFile(join(target, document), answer);
      records[document] = { source: hash(source), translation: hash(answer) };
      outcome.documents.written.push(document);
    }
    for (const document of Object.keys(records)) {
      if (!Object.hasOwn(sources, document)) {
        delete records[document];
      }
    }

    lock[locale] = {
      messages: ordered(entries, keys),
      documents: ordered(records, []),
    };
    await put(lockPath, `${json(ordered(lock, []))}\n`);
    output[locale] = outcome;
  }

  return output;
};
