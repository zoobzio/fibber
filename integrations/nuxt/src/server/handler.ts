import type { EventHandler } from "h3";
import type { Provider } from "fibber-lang/catalog";

import { createError, defineEventHandler } from "h3";

import { readTarget } from "./route";

/**
 * Creates the one event handler that serves locale bundles over the catalog
 * wire protocol, so `defineClient` from `fibber-lang/catalog` reads it
 * unchanged:
 *
 * - `GET {base}/locales` answers the entries the source serves
 * - `GET {base}/locales/{locale}` answers one bundle, or 404
 *
 * Put it in a catch-all server route file; the file's folder is the base:
 *
 * ```ts
 * // server/api/fibber/[...path].get.ts — base "/api/fibber"
 * export default createLocaleHandler({
 *   list: () => toEntries(contract),
 *   get: (locale) => storage.getItem(`locales:${locale}`),
 * });
 * ```
 *
 * The provider binds the handler to wherever the bundles are stored. They
 * are served as the provider returns them: the client proves each one
 * against the app's contract when it arrives.
 *
 * @param provider - The storage callbacks: `list` answers the entries, `get`
 * answers a locale with its bundle, or `null` / `undefined` for a miss.
 * @returns The h3 event handler.
 */
export const createLocaleHandler = (provider: Provider): EventHandler => {
  return defineEventHandler(async (event) => {
    const locale = readTarget(event);

    if (locale === undefined) {
      const entries: unknown = await provider.list();
      if (!Array.isArray(entries)) {
        throw createError({
          statusCode: 500,
          statusMessage: "Catalog listing unavailable",
        });
      }
      return entries;
    }

    const bundle: unknown = await provider.get(locale);
    if (bundle === undefined || bundle === null) {
      throw createError({ statusCode: 404, statusMessage: "Locale not found" });
    }
    return bundle;
  });
};
