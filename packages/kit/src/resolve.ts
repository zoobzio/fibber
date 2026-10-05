import { resolve } from "node:path";

import type {
  Bundle,
  Coverage,
  GenerateOptions,
  Kit,
  KitConfig,
} from "./types";
import { checkTranslation, compileSource, knownFormats } from "./contract";
import { listDocuments, readDocument } from "./documents";
import { InvalidMessagesError } from "./error";
import { readTranslations } from "./read";
import { readSources } from "./sources";
import { validate } from "./validate";

/**
 * Resolves a kit config to everything a build emits: validates the config,
 * reads and compiles the source messages into the contract, then builds a
 * complete bundle per locale — a key a locale has not translated carries the
 * source message, so the runtime loads one bundle and never falls back.
 *
 * The source is one file, or a directory of them whose paths nest the keys
 * (see {@link readSources}); each locale's translations mirror it. A target
 * locale with no translations yet is not an error: its bundle is the
 * source's, and every key is reported missing.
 *
 * @param config - The kit config.
 * @param options - The project root.
 * @throws InvalidConfigError when the config breaks a rule, before reading.
 * @throws InvalidDocumentError when a document is missing or malformed.
 * @throws InvalidMessagesError when the keys do not form a tree, a message
 * does not compile or refers to a named format that does not exist, or a
 * translation does not fit its source.
 */
export const resolveKit = async (
  config: KitConfig,
  options: GenerateOptions = {},
): Promise<Kit> => {
  const settings = validate(config);
  const root = resolve(options.cwd ?? process.cwd());
  const issues: string[] = [];

  const known = knownFormats(settings.formats);

  const { messages: source, chunks } = await readSources(root, settings);
  const inputs = chunks.map((chunk) => chunk.path);

  const contract = compileSource(source, known);
  const { messages, reference } = contract;
  for (const [key, found] of Object.entries(contract.issues)) {
    for (const issue of found) {
      issues.push(`${settings.locale}: ${JSON.stringify(key)} ${issue}`);
    }
  }

  // The content: every source document, then each locale's translation of
  // it — or the source document where a locale has none.
  const contentDir =
    settings.content === undefined
      ? undefined
      : resolve(root, settings.content);
  const paths = contentDir === undefined ? [] : await listDocuments(contentDir);
  const sources: Record<string, string> = {};
  for (const path of paths) {
    const document = await readDocument(contentDir ?? root, path);
    if (document !== undefined) {
      sources[path] = document;
      inputs.push(resolve(contentDir ?? root, path));
    }
  }
  const content: Record<string, Record<string, string>> = {
    [settings.locale]: sources,
  };

  const bundles: Record<string, Bundle> = { [settings.locale]: reference };
  const coverage: Record<string, Coverage> = {};
  for (const locale of settings.targets) {
    const translated: Record<string, string> = {};
    for (const chunk of chunks) {
      const path = chunk.translation(locale);
      const translations = await readTranslations(path);
      if (translations === undefined) {
        continue;
      }
      inputs.push(path);
      for (const [key, message] of Object.entries(translations)) {
        translated[`${chunk.prefix}${key}`] = message;
      }
    }

    const bundle: Bundle = {};
    const missing: string[] = [];
    for (const [key, message] of Object.entries(messages)) {
      const translation = Object.hasOwn(translated, key)
        ? translated[key]
        : undefined;
      const fallback = reference[key];
      if (translation === undefined) {
        missing.push(key);
        if (fallback !== undefined) {
          bundle[key] = fallback;
        }
        continue;
      }
      const checked = checkTranslation(translation, message, known);
      if (!checked.ok) {
        for (const issue of checked.issues) {
          issues.push(`${locale}: ${JSON.stringify(key)} ${issue}`);
        }
      }
      if (checked.ast !== undefined) {
        bundle[key] = checked.ast;
      }
    }
    const translatedDir = resolve(root, settings.translations, locale);
    const localized: Record<string, string> = {};
    const untranslated: string[] = [];
    for (const [path, document] of Object.entries(sources)) {
      const translation = await readDocument(translatedDir, path);
      if (translation === undefined) {
        untranslated.push(path);
        localized[path] = document;
      } else {
        localized[path] = translation;
        inputs.push(resolve(translatedDir, path));
      }
    }
    content[locale] = localized;

    bundles[locale] = bundle;
    coverage[locale] = {
      documents: untranslated,
      missing,
      orphaned: Object.keys(translated).filter(
        (key) => !Object.hasOwn(source, key),
      ),
    };
  }

  if (issues.length > 0) {
    throw new InvalidMessagesError(issues);
  }
  return {
    locale: settings.locale,
    locales: [settings.locale, ...settings.targets],
    formats: settings.formats,
    messages,
    bundles,
    documents: Object.keys(sources),
    content,
    outDir: settings.outDir,
    coverage,
    inputs,
  };
};
