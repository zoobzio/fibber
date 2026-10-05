/**
 * The config file the CLI looks for in the project root when `--config` is not
 * given.
 */
export const FILENAME = "fibber.config.ts";

/**
 * The default output directory, relative to the project root.
 */
export const OUT_DIR = "fibber";

/**
 * The default directory of translated messages, relative to the project root:
 * one `<locale>.json` per target locale.
 */
export const TRANSLATIONS = "translations";

/**
 * The directory the locale bundles are emitted under, inside the output
 * directory.
 */
export const BUNDLES = "locales";

/**
 * The directory the content documents are emitted under, inside the output
 * directory: `content/<locale>/<path>`.
 */
export const CONTENT = "content";

/**
 * The manifest a write leaves in the output directory: the paths it produced,
 * so the next write can remove the ones it no longer does without touching
 * anything the kit did not write.
 */
export const MANIFEST = ".fibber.json";

/**
 * The lock `fibber translate` keeps beside the translations: for every
 * translation, the source message it was made from and the text it was given,
 * as hashes — how a later run tells a source that changed from a translation
 * someone edited by hand.
 */
export const LOCK = ".fibber.lock.json";
