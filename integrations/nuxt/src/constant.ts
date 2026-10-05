/**
 * The build-directory folder the module writes the kit's output into — the
 * same `index` and `bundles` modules, locale bundles and content documents
 * `fibber build` writes to its output directory, importable in the app as
 * `#build/fibber/index.mjs` and `#build/fibber/bundles.mjs`.
 */
export const MODULES = "fibber";

/**
 * The folder of a kit build its content documents sit under:
 * `content/<locale>/<path>`. The kit's own `CONTENT`, repeated here so a
 * build made elsewhere is used without the kit installed.
 */
export const CONTENT = "content";

/** The cookie the visitor's locale is kept in. */
export const LOCALE_COOKIE = "fibber-locale";

/** The cookie the visitor's time zone is kept in. */
export const TIME_ZONE_COOKIE = "fibber-time-zone";

/** The cookie the visitor's convention is kept in. */
export const CONVENTION_COOKIE = "fibber-convention";

/**
 * Where the built content documents are served from, as static files:
 * `{CONTENT_URL}/<locale>/<path>`.
 */
export const CONTENT_URL = "/_fibber/content";
