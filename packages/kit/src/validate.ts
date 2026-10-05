import type { Formats, Kind } from "@fibber/schema";

import { record } from "objectively";

import type { TranslateOptions } from "@fibber/translate";

import type { KitConfig } from "./types";
import { OUT_DIR, TRANSLATIONS } from "./constant";
import { InvalidConfigError } from "./error";
import { inside, normalize } from "./path";

/** A config through {@link validate}: defaults applied, paths normalized. */
export interface Settings {
  source: string;
  locale: string;
  targets: string[];
  translations: string;
  content: string | undefined;
  formats: Required<Formats>;
  translate: TranslateOptions | undefined;
  outDir: string;
}

/** How each kind of format proves its options: by constructing with them. */
const CONSTRUCT: Record<Kind, (options: object) => unknown> = {
  number: (options) => new Intl.NumberFormat("en", options),
  date: (options) => new Intl.DateTimeFormat("en", options),
  time: (options) => new Intl.DateTimeFormat("en", options),
};

/**
 * Checks the declared formats — each kind a record of names to `Intl`
 * options the runtime can construct a formatter from — noting every issue,
 * and returns them with every kind present.
 */
const formats = (value: unknown, issues: string[]): Required<Formats> => {
  const checked: Record<Kind, Record<string, object>> = {
    number: {},
    date: {},
    time: {},
  };
  if (value === undefined) {
    return checked;
  }
  if (!record(value)) {
    issues.push("formats must be a record of number, date and time formats");
    return checked;
  }
  for (const kind of Object.keys(value)) {
    if (kind !== "number" && kind !== "date" && kind !== "time") {
      issues.push(
        `formats.${kind} is not a kind of format (number, date, time)`,
      );
      continue;
    }
    const named = value[kind];
    if (!record(named)) {
      issues.push(`formats.${kind} must be a record of names to Intl options`);
      continue;
    }
    for (const [name, options] of Object.entries(named)) {
      if (!record(options)) {
        issues.push(
          `formats.${kind}.${name} must be an object of Intl options`,
        );
        continue;
      }
      try {
        CONSTRUCT[kind](options);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        issues.push(`formats.${kind}.${name} is not valid (${reason})`);
        continue;
      }
      checked[kind][name] = options;
    }
  }
  return checked;
};

/**
 * The issue with a locale tag, if any: it must be a string that is already
 * its own canonical BCP 47 form, since it names a file and a member of the
 * emitted `Locale` union.
 */
const tag = (label: string, locale: unknown): string | undefined => {
  if (typeof locale !== "string") {
    return `${label} must be a string`;
  }
  let canonical: string | undefined;
  try {
    [canonical] = Intl.getCanonicalLocales(locale);
  } catch {
    return `${label} ${JSON.stringify(locale)} is not a BCP 47 locale tag`;
  }
  if (canonical !== locale) {
    return `${label} ${JSON.stringify(locale)} must be written canonically, as ${JSON.stringify(canonical)}`;
  }
  return undefined;
};

/**
 * Checks a config against every rule that can be decided without reading a
 * document, and applies its defaults.
 *
 * @param config - The authored config.
 * @throws InvalidConfigError carrying every issue found.
 */
export const validate = (config: KitConfig): Settings => {
  const issues: string[] = [];
  const note = (issue: string | undefined) => {
    if (issue !== undefined) {
      issues.push(issue);
    }
  };

  if (typeof config.source !== "string" || config.source === "") {
    issues.push(
      "source must be the path of a message-descriptor document, or of a directory of them",
    );
  }
  note(tag("locale", config.locale));

  const targets = config.locales ?? [];
  if (!Array.isArray(targets)) {
    issues.push("locales must be an array of locale tags");
  } else {
    const seen = new Set<unknown>();
    for (const [index, target] of targets.entries()) {
      note(tag(`locales[${index}]`, target));
      if (target === config.locale) {
        issues.push(
          `locales[${index}] ${JSON.stringify(target)} is the source locale — list only the locales it is translated to`,
        );
      }
      if (seen.has(target)) {
        issues.push(
          `locales[${index}] ${JSON.stringify(target)} is listed twice`,
        );
      }
      seen.add(target);
    }
  }

  const directory = (label: string, path: unknown, fallback: string) => {
    if (path === undefined) {
      return fallback;
    }
    if (typeof path !== "string" || !inside(normalize(path))) {
      issues.push(`${label} must be a directory inside the project root`);
      return fallback;
    }
    return normalize(path);
  };
  const translations = directory(
    "translations",
    config.translations,
    TRANSLATIONS,
  );
  const outDir = directory("outDir", config.outDir, OUT_DIR);
  const content =
    config.content === undefined
      ? undefined
      : directory("content", config.content, "");
  const declared = formats(config.formats, issues);

  if (config.translate !== undefined) {
    if (!record(config.translate)) {
      issues.push("translate must be an object of translation options");
    } else if (config.translate.model === undefined) {
      issues.push(
        "translate.model is required: a model from an AI SDK provider",
      );
    }
  }

  if (issues.length > 0) {
    throw new InvalidConfigError(issues);
  }
  return {
    source: config.source,
    locale: config.locale,
    targets: [...targets],
    translations,
    content,
    formats: declared,
    translate: config.translate,
    outDir,
  };
};
