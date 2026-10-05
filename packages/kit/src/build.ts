import { resolve } from "node:path";

import type { BuildOptions, Output } from "./types";
import { FILENAME } from "./constant";
import { generate } from "./generate";
import { loadConfig } from "./load";
import { writeOutput } from "./write";

/**
 * The whole build, end to end: load the config, generate, and write the output
 * directory. What the CLI runs.
 *
 * @param options - The root and config path.
 */
export const build = async (options: BuildOptions = {}): Promise<Output> => {
  const { root: rootOption, config: configOption, ...hooks } = options;
  const root = resolve(rootOption ?? process.cwd());
  const config = await loadConfig(resolve(root, configOption ?? FILENAME));
  const output = await generate(config, { ...hooks, cwd: root });
  await writeOutput(output, root);
  return output;
};
