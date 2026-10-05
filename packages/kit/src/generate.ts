import type { GenerateOptions, KitConfig, Output } from "./types";
import { emit } from "./emit";
import { resolveKit } from "./resolve";

/**
 * Generates the contract module and locale bundles from a kit config: checks
 * and resolves it through {@link resolveKit}, and emits the files for
 * `outDir`. An app imports them by relative path; a published package points
 * its `exports` at them. No filesystem writes.
 *
 * @param config - The kit config.
 * @param options - The project root.
 * @throws InvalidConfigError when the config breaks a rule, before reading.
 */
export const generate = async (
  config: KitConfig,
  options: GenerateOptions = {},
): Promise<Output> => {
  const kit = await resolveKit(config, options);
  return { outDir: kit.outDir, files: emit(kit), coverage: kit.coverage };
};
