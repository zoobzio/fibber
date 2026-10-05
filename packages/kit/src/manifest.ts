import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { record } from "objectively";

import { MANIFEST } from "./constant";
import { inside, normalize } from "./path";

/**
 * Reads the paths the previous write recorded in an output directory. A
 * missing or unreadable manifest yields none, and an entry that would reach
 * outside the directory is dropped — the list decides what a write removes, so
 * anything doubtful is left alone.
 *
 * @param dir - The absolute output directory.
 */
export const readManifest = async (dir: string): Promise<string[]> => {
  let files: unknown;
  try {
    const manifest: unknown = JSON.parse(
      await readFile(join(dir, MANIFEST), "utf8"),
    );
    if (record(manifest)) {
      files = manifest.files;
    }
  } catch {
    return [];
  }
  if (!Array.isArray(files)) {
    return [];
  }
  return files.filter((path): path is string => {
    return typeof path === "string" && inside(normalize(path));
  });
};

/**
 * Records the paths a write produced, for the next write to read back.
 *
 * @param dir - The absolute output directory.
 * @param files - The written paths, relative to `dir`.
 */
export const writeManifest = async (
  dir: string,
  files: string[],
): Promise<void> => {
  await writeFile(
    join(dir, MANIFEST),
    `${JSON.stringify({ files }, null, 2)}\n`,
  );
};
