import type { H3Event } from "h3";

import { createError } from "h3";
import { ROUTE } from "fibber-lang/catalog";

/**
 * The segments of a path, empty ones dropped: a leading or trailing slash
 * contributes none.
 */
const segments = (path: string): string[] => {
  return path.split("/").filter((segment) => segment !== "");
};

/**
 * The segments of the request path below the handler's base. In a catch-all
 * route file the router records the route it matched — the file's folder
 * followed by the catch-all — so the base is that route without its final
 * catch-all segment, and the request path drops as many segments as the
 * base has. Whatever the catch-all is named, and whatever the folder holds
 * (a dynamic segment included), the base is never mistaken for the route. A
 * handler mounted on a prefix (`app.use(base, handler)`) matched no route;
 * there the event's own path is already relative to the prefix.
 */
const below = (event: H3Event): string[] => {
  const [path = ""] = event.path.split("?");
  const route = event.context.matchedRoute?.path;
  if (route === undefined) {
    return segments(path);
  }
  const base = segments(route).filter((segment) => !segment.startsWith("**"));
  return segments(path).slice(base.length);
};

/**
 * What a request asks the catalog for: `locales` asks for the listing and
 * `locales/{locale}` for one bundle. Answers 404 for any other path below the
 * base, and 400 for a locale that does not decode.
 *
 * @param event - The request.
 * @returns The decoded locale, or `undefined` for the listing.
 */
export const readTarget = (event: H3Event): string | undefined => {
  const [root, encoded, ...rest] = below(event);
  if (root !== ROUTE || rest.length > 0) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
  if (encoded === undefined) {
    return undefined;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Malformed locale",
    });
  }
};
