import { existsSync } from "node:fs";

import { createJiti } from "jiti";
import { record } from "objectively";

import type { KitConfig } from "./types";
import { MalformedConfigError, MissingConfigError } from "./error";

/**
 * Whether a value has the outer shape of a {@link KitConfig}: a plain record
 * whose `source` and `locale` are strings. A shape test only — whether the
 * members satisfy the kit's rules is {@link validate}'s concern.
 */
const isConfig = (value: unknown): value is KitConfig => {
  if (!record(value)) {
    return false;
  }
  return typeof value.source === "string" && typeof value.locale === "string";
};

/**
 * Loads a `fibber.config.ts` — or any TypeScript / JavaScript config file —
 * through jiti and returns its default export. Only the outer shape is checked
 * here; {@link resolveKit} validates the rest. An error thrown while the file
 * itself runs propagates untouched.
 *
 * @param path - The absolute path to the config file.
 * @throws MissingConfigError when there is no file at `path`.
 * @throws MalformedConfigError when the default export is not config-shaped.
 */
export const loadConfig = async (path: string): Promise<KitConfig> => {
  if (!existsSync(path)) {
    throw new MissingConfigError(path);
  }
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const config = await jiti.import<unknown>(path, { default: true });
  if (!isConfig(config)) {
    throw new MalformedConfigError(path);
  }
  return config;
};
