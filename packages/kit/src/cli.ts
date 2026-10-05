import { parseArgs } from "node:util";

import { build } from "./build";

import { translate } from "./translate";

const HELP = `Usage: fibber <command> [options]

Commands:
  build      Compile the source messages and their translations, and write
             the contract module and a bundle per locale to the output
             directory. Offline and deterministic.
  translate  Translate what is missing or out of date into the translations
             directory, for build to pick up. Calls the model.

Options:
  -c, --config <file>    Config file (default: fibber.config.ts)
  -r, --root <dir>       Project root (default: current directory)
  -l, --locale <locale>  translate: only this locale (repeatable)
      --check            translate: only report what is missing or out of
                         date; calls no model, writes nothing, and exits 1
                         when there is anything to translate
  -h, --help             Show this help`;

/** `1 message` / `3 messages`. */
const count = (amount: number, noun: string): string => {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
};

const runBuild = async (config?: string, root?: string): Promise<void> => {
  const output = await build({ config, root });
  console.log(
    `@fibber/kit: wrote ${output.files.length} files to ${output.outDir}`,
  );
  for (const [locale, { missing, orphaned, documents }] of Object.entries(
    output.coverage,
  )) {
    if (documents.length > 0) {
      console.warn(
        `@fibber/kit: ${locale} is missing ${documents.length} documents (built from the source document)`,
      );
    }
    if (missing.length > 0) {
      console.warn(
        `@fibber/kit: ${locale} is missing ${missing.length} translations (built from the source message)`,
      );
    }
    if (orphaned.length > 0) {
      console.warn(
        `@fibber/kit: ${locale} translates ${orphaned.length} keys the source no longer has (left out)`,
      );
    }
  }
};

const runCheck = async (
  config?: string,
  root?: string,
  locales?: string[],
): Promise<void> => {
  const output = await translate({ config, root, locales, check: true });
  for (const [locale, outcome] of Object.entries(output)) {
    const { pending, kept, documents } = outcome;
    if (pending.length + kept.length + documents.pending.length === 0) {
      console.log(`@fibber/kit: ${locale} — up to date`);
      continue;
    }
    process.exitCode = 1;
    console.error(
      `@fibber/kit: ${locale} — ${count(pending.length, "message")} and ${count(documents.pending.length, "document")} to translate`,
    );
    for (const key of pending) {
      console.error(`  ${JSON.stringify(key)}`);
    }
    for (const path of documents.pending) {
      console.error(`  ${path}`);
    }
    for (const key of kept) {
      console.error(
        `  ${JSON.stringify(key)} was written by hand and its source has since changed`,
      );
    }
  }
};

const runTranslate = async (
  config?: string,
  root?: string,
  locales?: string[],
): Promise<void> => {
  const output = await translate({ config, root, locales });
  for (const [locale, outcome] of Object.entries(output)) {
    console.log(
      `@fibber/kit: ${locale} — translated ${count(outcome.written.length, "message")} and ${count(outcome.documents.written.length, "document")}`,
    );
    for (const [path, issues] of Object.entries(outcome.documents.rejected)) {
      for (const issue of issues) {
        console.warn(
          `@fibber/kit: ${locale} ${path} was rejected: it ${issue}`,
        );
      }
    }
    for (const key of outcome.kept) {
      console.warn(
        `@fibber/kit: ${locale} ${JSON.stringify(key)} was written by hand and its source has since changed (kept — delete it to translate again)`,
      );
    }
    for (const key of outcome.skipped) {
      console.warn(
        `@fibber/kit: ${locale} ${JSON.stringify(key)} came back with no translation`,
      );
    }
    for (const [key, issues] of Object.entries(outcome.rejected)) {
      for (const issue of issues) {
        console.warn(
          `@fibber/kit: ${locale} ${JSON.stringify(key)} was rejected: it ${issue}`,
        );
      }
    }
    if (
      outcome.skipped.length > 0 ||
      Object.keys(outcome.rejected).length > 0 ||
      Object.keys(outcome.documents.rejected).length > 0
    ) {
      process.exitCode = 1;
    }
  }
};

const main = async (argv: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c" },
      root: { type: "string", short: "r" },
      locale: { type: "string", short: "l", multiple: true },
      check: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }
  const [command] = positionals;
  if (positionals.length === 1 && command === "build") {
    return runBuild(values.config, values.root);
  }
  if (positionals.length === 1 && command === "translate") {
    const run = values.check ? runCheck : runTranslate;
    return run(values.config, values.root, values.locale);
  }
  console.error(HELP);
  process.exitCode = 1;
};

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
