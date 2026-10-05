import type { Definition, Schema } from "@fibber/schema";
import type { Entry } from "./types";

import { record } from "objectively";

/**
 * Whether a value carries a well-formed {@link Entry} of a contract: a
 * locale the contract declares, and a name. Fields beyond the model are
 * tolerated — an entry is data, and a source sending extra metadata loses
 * nothing by having it ignored.
 */
const isEntry = <D extends Definition>(
  schema: Schema<D>,
  value: unknown,
): value is Entry<D> => {
  if (!record(value)) {
    return false;
  }
  if (!schema.check.locale(value.id)) {
    return false;
  }
  return typeof value.name === "string" && value.name.length > 0;
};

/**
 * Whether a value is a well-formed listing: an array of entries of the
 * contract.
 *
 * @param schema - The contract the entries' locales are checked against.
 * @param value - The value to test.
 */
export const isListing = <D extends Definition>(
  schema: Schema<D>,
  value: unknown,
): value is Entry<D>[] => {
  return Array.isArray(value) && value.every((entry) => isEntry(schema, entry));
};

/**
 * The entries of every locale a contract declares, each named in its own
 * language (`fr` as `français`) — the listing a source that serves the whole
 * contract answers with, and what a provider narrows when it serves less. A
 * locale the runtime has no name for is named by its tag.
 *
 * @param definition - The contract `@fibber/kit` built.
 */
export const toEntries = <D extends Definition>(definition: D): Entry<D>[] => {
  return definition.locales.map((locale) => {
    let name: string | undefined;
    try {
      name = new Intl.DisplayNames(locale, { type: "language" }).of(locale);
    } catch {
      // No display names for the locale: fall through to the tag.
    }
    return { id: locale, name: name ?? locale };
  });
};
