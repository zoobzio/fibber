import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { Output } from "./types";
import { readManifest, writeManifest } from "./manifest";

/**
 * Writes an output's files under `<root>/<outDir>`. The directory may be
 * shared with authored source (`src/fibber`), so it is never cleared: the
 * kit's own files are overwritten in place, and the only files removed are
 * ones the previous write recorded in its manifest and this output no longer
 * produces. A file the kit did not write is never touched.
 *
 * @param output - The output to write.
 * @param root - The project root.
 */
export const writeOutput = async (
  output: Output,
  root: string,
): Promise<void> => {
  const dir = resolve(root, output.outDir);
  await mkdir(dir, { recursive: true });

  const produced = output.files.map((file) => file.path);
  for (const path of await readManifest(dir)) {
    if (!produced.includes(path)) {
      await rm(join(dir, path), { force: true });
    }
  }

  for (const file of output.files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents);
  }
  await writeManifest(dir, produced);
};
