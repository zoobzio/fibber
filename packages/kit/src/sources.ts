import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { Descriptor } from "./types";
import type { Settings } from "./validate";
import { InvalidMessagesError } from "./error";
import { normalize } from "./path";
import { readSource } from "./read";

/** The extension of the documents a source directory is read for. */
const EXTENSION = ".json";

/**
 * One file of source messages, and where each locale's translation of it
 * lives.
 */
export interface Chunk {
  /** The absolute path of the source file. */
  path: string;

  /**
   * What the file's keys nest under: `foo.bar.` for `foo/bar.json` in a
   * source directory, empty for a source that is a single file.
   */
  prefix: string;

  /** The file's own keys, as authored and in order. */
  keys: string[];

  /**
   * The absolute path of a locale's translations of the file:
   * `<translations>/<locale>/<path>` for a file of a source directory,
   * `<translations>/<locale>.json` for a source that is a single file.
   */
  translation: (locale: string) => string;
}

/** The source messages of a project, and the files they were read from. */
export interface Sources {
  /** Every message by its full key, in file then authored order. */
  messages: Record<string, Descriptor>;

  /** The files the messages were read from, sorted by path. */
  chunks: Chunk[];
}

/**
 * Lists the JSON documents under a directory, at any depth, as posix paths
 * relative to it, sorted. `undefined` when the path is not a directory.
 */
const list = async (directory: string): Promise<string[] | undefined> => {
  let entries: string[];
  try {
    entries = await readdir(directory, { recursive: true });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOTDIR" || error.code === "ENOENT")
    ) {
      return undefined;
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.endsWith(EXTENSION))
    .map(normalize)
    .sort();
};

/**
 * Reads the source messages. A source that is a file is one
 * message-descriptor document, its keys the message keys. A source that is a
 * directory is every `.json` document under it, at any depth, each one's
 * keys nested under its path: `title` in `foo/bar.json` is the message
 * `foo.bar.title`.
 *
 * A dot in a key nests the same way a directory does, so a key may neither
 * be declared twice nor be both a message and a group of messages.
 *
 * @param root - The absolute project root.
 * @param settings - The validated config.
 * @throws InvalidDocumentError when a file is missing, is not JSON, or an
 * entry is not a descriptor.
 * @throws InvalidMessagesError when the keys do not form a tree.
 */
export const readSources = async (
  root: string,
  settings: Settings,
): Promise<Sources> => {
  const source = resolve(root, settings.source);
  const translations = resolve(root, settings.translations);
  const paths = await list(source);

  const files =
    paths === undefined
      ? [
          {
            path: source,
            prefix: "",
            translation: (locale: string) =>
              join(translations, `${locale}.json`),
          },
        ]
      : paths.map((path) => ({
          path: join(source, path),
          prefix: `${path.slice(0, -EXTENSION.length).replaceAll("/", ".")}.`,
          translation: (locale: string) => join(translations, locale, path),
        }));

  const messages: Record<string, Descriptor> = {};
  const owners: Record<string, string> = {};
  const chunks: Chunk[] = [];
  const issues: string[] = [];
  for (const file of files) {
    const read = await readSource(file.path);
    const name = normalize(relative(root, file.path));
    for (const [local, descriptor] of Object.entries(read)) {
      const key = `${file.prefix}${local}`;
      if (key.split(".").includes("")) {
        issues.push(
          `${JSON.stringify(key)} (${name}) has an empty segment — a dot separates the groups a message nests under`,
        );
        continue;
      }
      if (Object.hasOwn(messages, key)) {
        issues.push(
          `${JSON.stringify(key)} is declared in both ${owners[key]} and ${name}`,
        );
        continue;
      }
      messages[key] = descriptor;
      owners[key] = name;
    }
    chunks.push({ ...file, keys: Object.keys(read) });
  }

  for (const key of Object.keys(messages)) {
    const segments = key.split(".");
    for (let depth = 1; depth < segments.length; depth += 1) {
      const group = segments.slice(0, depth).join(".");
      if (Object.hasOwn(messages, group)) {
        issues.push(
          `${JSON.stringify(group)} (${owners[group]}) is both a message and the group of ${JSON.stringify(key)} (${owners[key]})`,
        );
      }
    }
  }

  if (issues.length > 0) {
    throw new InvalidMessagesError(issues);
  }
  return { messages, chunks };
};
