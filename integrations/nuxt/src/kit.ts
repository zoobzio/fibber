import type { Nuxt } from "@nuxt/schema";
import type * as Kit from "@fibber/kit";
import type { NuxtFibberConfig } from "./config";

import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { directoryToURL, tryResolveModule, useLogger } from "@nuxt/kit";

import { CONTENT, MODULES } from "./constant";

/** The modules of a kit build the app imports: the contract and the loaders. */
const ENTRIES = ["index", "bundles"];

/**
 * What the module serves, wherever it was built: the files it writes under
 * the build directory's `fibber/`, and the directory the content documents
 * are served from — `undefined` when there are none.
 */
export interface Source {
  files: Kit.OutputFile[];
  content: string | undefined;
}

/**
 * Loads `@fibber/kit`, an optional peer of the module: only an app that
 * builds its own messages needs it, among its dev dependencies — one that
 * points `build` at a kit build made elsewhere never loads it.
 */
const loadKit = async (): Promise<typeof Kit> => {
  try {
    return await import("@fibber/kit");
  } catch (error) {
    throw new Error(
      "fibber: building the app's messages needs @fibber/kit, which could not be loaded — add it to your devDependencies, or point `build` at a kit build made elsewhere",
      { cause: error },
    );
  }
};

/**
 * Finds the output directory of a kit build made elsewhere. `build` is a
 * path — relative to the project root, or absolute — to the directory or to
 * its `index.mjs`, or a package whose main entry is that `index.mjs`.
 *
 * @param build - The module's `build` option.
 * @param root - The project root.
 * @throws when nothing resolves, or what does is not a kit build.
 */
const locate = async (build: string, root: string): Promise<string> => {
  let path: string | undefined;
  if (build.startsWith(".") || isAbsolute(build)) {
    path = resolve(root, build);
  } else {
    const resolved = await tryResolveModule(build, directoryToURL(root));
    path = resolved?.startsWith("file:") ? fileURLToPath(resolved) : resolved;
  }
  if (path === undefined || !existsSync(path)) {
    throw new Error(
      `fibber: \`build\` ${JSON.stringify(build)} could not be found from ${root}`,
    );
  }
  const directory = statSync(path).isFile() ? dirname(path) : path;
  for (const entry of ENTRIES) {
    if (!existsSync(join(directory, `${entry}.mjs`))) {
      throw new Error(
        `fibber: ${directory} is not a kit build — it has no ${entry}.mjs (run \`fibber build\` there first)`,
      );
    }
  }
  return directory;
};

/**
 * A kit build made elsewhere, as the module's files: each of the build's
 * modules re-exported from where it stands, declarations included, so the
 * app imports `#build/fibber/*` either way. The bundles are not copied —
 * the build's own loaders import them, lazily, from beside themselves.
 */
const adopt = (directory: string): Kit.OutputFile[] => {
  return ENTRIES.flatMap((entry) => {
    const contents = `export * from ${JSON.stringify(join(directory, `${entry}.mjs`))};\n`;
    return [
      { path: `${entry}.mjs`, contents },
      { path: `${entry}.d.mts`, contents },
    ];
  });
};

/** The kit's `translate`: a whole translation run over a project. */
type Translator = (typeof Kit)["translate"];

/**
 * Translates what the app's locales are missing or have out of date, by the
 * module's `translate` options, and says what it did. A translation that
 * came back unusable is a warning, not a failure: the build that follows
 * carries the source message in its place. A failure of the model itself
 * fails the build.
 *
 * @param translate - The kit's `translate`.
 * @param options - The module's `translate` options.
 * @param root - The project root.
 * @param config - The kit config, as an absolute path.
 */
const runTranslate = async (
  translate: Translator,
  options: NonNullable<NuxtFibberConfig["translate"]>,
  root: string,
  config: string,
): Promise<void> => {
  const logger = useLogger("fibber");
  const output = await translate({ root, config, translate: options });
  for (const [locale, outcome] of Object.entries(output)) {
    const { written, rejected, skipped, kept, documents } = outcome;
    if (written.length + documents.written.length > 0) {
      logger.info(
        `${locale}: translated ${written.length} messages and ${documents.written.length} documents`,
      );
    }
    for (const [key, issues] of Object.entries({
      ...rejected,
      ...documents.rejected,
    })) {
      logger.warn(
        `${locale}: the translation of ${JSON.stringify(key)} was rejected — it ${issues.join("; it ")}`,
      );
    }
    for (const key of skipped) {
      logger.warn(
        `${locale}: ${JSON.stringify(key)} came back with no translation`,
      );
    }
    for (const key of kept) {
      logger.warn(
        `${locale}: ${JSON.stringify(key)} was written by hand and its source has since changed (kept — delete it to translate again)`,
      );
    }
  }
};

/**
 * Loads what the module serves, one of two ways. With a `build`, it is the
 * output of a kit build made elsewhere, used from where it stands. Without
 * one, the app's own kit config is built here through `@fibber/kit` —
 * nothing is written to the project — and the config and every file it read
 * (the source messages, each locale's translations, the content documents)
 * join Nuxt's watch list, so editing any of them restarts dev and builds
 * again. With `translate`, the app's translations are brought up to date
 * first, so the build that follows carries them.
 *
 * @param options - The module's configuration.
 * @param nuxt - The Nuxt instance, for the project root and the watch list.
 */
export const loadSource = async (
  options: NuxtFibberConfig,
  nuxt: Nuxt,
): Promise<Source> => {
  const root = nuxt.options.rootDir;

  if (options.build !== undefined) {
    const directory = await locate(options.build, root);
    const content = join(directory, CONTENT);
    return {
      files: adopt(directory),
      content: existsSync(content) ? content : undefined,
    };
  }

  const { FILENAME, emit, loadConfig, resolveKit, translate } = await loadKit();
  const path = resolve(root, options.config ?? FILENAME);
  nuxt.options.watch.push(path);
  // Preparing only generates types: no reason to call a model for them.
  if (options.translate !== undefined && !nuxt.options._prepare) {
    await runTranslate(translate, options.translate, root, path);
  }
  const kit = await resolveKit(await loadConfig(path), { cwd: root });
  nuxt.options.watch.push(...kit.inputs);
  return {
    files: emit(kit),
    content:
      kit.documents.length > 0
        ? join(nuxt.options.buildDir, MODULES, CONTENT)
        : undefined,
  };
};
