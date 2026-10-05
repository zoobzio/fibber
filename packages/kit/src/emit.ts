import type { Formats } from "@fibber/schema";

import type { Core, OutputFile } from "./types";
import { BUNDLES, CONTENT } from "./constant";
import { banner, json, member, pair, union } from "./print";

/** The `Intl` options type each kind of format is declared with. */
const OPTIONS = {
  number: "Intl.NumberFormatOptions",
  date: "Intl.DateTimeFormatOptions",
  time: "Intl.DateTimeFormatOptions",
} as const;

/**
 * The declared formats as the type of the contract's `formats` member: each
 * kind listing its names, so the runtime's helpers complete and check them.
 */
const formats = (declared: Required<Formats>): string[] => {
  const kinds = (["number", "date", "time"] as const).map((kind) => {
    const names = Object.keys(declared[kind]).map(
      (name) => `readonly ${JSON.stringify(name)}: ${OPTIONS[kind]}`,
    );
    const shape =
      names.length === 0 ? "Record<never, never>" : `{ ${names.join("; ")} }`;
    return `    readonly ${kind}: ${shape};`;
  });
  return ["  readonly formats: {", ...kinds, "  };"];
};

/**
 * The root entry: the contract. The message keys and locales with their
 * guards, the `Arguments` interface typing what each message takes, and the
 * `contract` a runtime service is made from. Carries no message text, so
 * importing it never pulls a bundle into a build.
 */
const index = (core: Core): OutputFile[] => {
  const keys = Object.keys(core.messages);
  const members = Object.entries(core.messages).map(([key, message]) =>
    member(key, message),
  );
  return pair(
    "index",
    [
      banner(),
      `export const locale = ${JSON.stringify(core.locale)};`,
      `export const locales = Object.freeze(${json(core.locales)});`,
      `export const messages = Object.freeze(${json(keys)});`,
      "const knownLocales = new Set(locales);",
      "const knownMessages = new Set(messages);",
      `export const isLocale = (value) => typeof value === "string" && knownLocales.has(value);`,
      `export const isMessage = (value) => typeof value === "string" && knownMessages.has(value);`,
      `export const documents = Object.freeze(${json(core.documents)});`,
      `export const formats = Object.freeze(${json(core.formats)});`,
      "export const contract = Object.freeze({ locale, locales, messages, formats });",
    ],
    [
      banner(),
      `export type Locale =${union(core.locales)};`,
      `export type Message =${union(keys)};`,
      `export type Document =${union(core.documents)};`,
      members.length === 0
        ? "export interface Arguments {}"
        : `export interface Arguments {\n${members.join("\n")}\n}`,
      `export declare const locale: ${JSON.stringify(core.locale)};`,
      "export declare const locales: readonly Locale[];",
      "export declare const messages: readonly Message[];",
      "export declare const documents: readonly Document[];",
      "export declare const isLocale: (value: unknown) => value is Locale;",
      "export declare const isMessage: (value: unknown) => value is Message;",
      "export declare const contract: {",
      `  readonly locale: ${JSON.stringify(core.locale)};`,
      "  readonly locales: readonly Locale[];",
      "  readonly messages: readonly Message[];",
      ...formats(core.formats),
      "  /** Never present at runtime; carries each message's values in the types. */",
      "  readonly arguments?: Arguments;",
      "};",
      "export type Contract = typeof contract;",
    ],
  );
};

/**
 * The locale bundles: one module per locale, its default export every message
 * key mapped to its compiled AST. Compact, since they are what ships to
 * production. A module rather than a JSON document, so the loaders import
 * them the same way everywhere: a JSON import needs an import attribute under
 * node, and a browser refuses that attribute from a dev server, which answers
 * JSON as JavaScript.
 */
const bundles = (core: Core): OutputFile[] => {
  return core.locales.map((locale) => ({
    path: `${BUNDLES}/${locale}.mjs`,
    contents: `export default ${JSON.stringify(core.bundles[locale] ?? {})};\n`,
  }));
};

/**
 * The `./bundles` entry: a loader per locale, each a dynamic import of that
 * locale's bundle. A bundler splits every bundle into its own chunk, so an
 * app ships the loaders and fetches only the locale it is in.
 */
const loaders = (core: Core): OutputFile[] => {
  const entries = core.locales.map(
    (locale) =>
      `  ${JSON.stringify(locale)}: () => import(${JSON.stringify(`./${BUNDLES}/${locale}.mjs`)}).then((module) => module.default),`,
  );
  return pair(
    "bundles",
    [
      banner(),
      `export const bundles = Object.freeze({\n${entries.join("\n")}\n});`,
    ],
    [
      banner(),
      'import type { Bundle } from "fibber-lang";',
      'import type { Contract, Locale } from "./index.mjs";',
      "export declare const bundles: {",
      "  readonly [L in Locale]: () => Promise<Bundle<Contract>>;",
      "};",
    ],
  );
};

/**
 * The content: every document of every locale, under `content/<locale>/`,
 * at the path it has in the content directory.
 */
const content = (core: Core): OutputFile[] => {
  return core.locales.flatMap((locale) =>
    Object.entries(core.content[locale] ?? {}).map(([path, contents]) => ({
      path: `${CONTENT}/${locale}/${path}`,
      contents,
    })),
  );
};

/**
 * Emits every file a build produces —
 *
 * - `index` — the `Locale` / `Message` / `Arguments` types, the locale and
 *   message lists, `isLocale`, `isMessage`, and the `contract` for
 *   `makeFibber`
 * - `bundles` — a lazy loader per locale, for bundlers to split on
 * - `locales/<locale>.mjs` — each locale's bundle of compiled messages
 * - `content/<locale>/<path>` — each locale's Markdown documents
 *
 * the module as an `.mjs` with its `.d.mts` beside it.
 *
 * Takes only the {@link Core}, so a consumer that already holds a contract
 * and bundles (a framework module) emits the same files the CLI writes.
 *
 * @param core - The contract and the bundles.
 */
export const emit = (core: Core): OutputFile[] => {
  return [...index(core), ...loaders(core), ...bundles(core), ...content(core)];
};
