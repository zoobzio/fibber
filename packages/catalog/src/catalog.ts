import type { Bundle, Definition, Locale, Schema } from "@fibber/schema";
import type { Catalog, Entry, Provider } from "./types";

import { SchemaError } from "@fibber/schema";

import { MalformedBundleError, MalformedListingError } from "./error";
import { isListing } from "./util";

/**
 * Creates a {@link Catalog} from storage callbacks — the serving angle, and
 * the machine behind the consuming one: {@link defineClient} compiles its
 * transport config into a {@link Provider} and boots this same factory, so
 * every behavior the two angles share lives here. `list` hands off to the
 * source and proves the answer is a listing of the contract's locales.
 * `get` proves the locale, hands it to the source, treats `null` /
 * `undefined` as a miss, and proves any other answer against the contract
 * before it surfaces. The schema is the only carrier of `D`: the catalog's
 * type is earned through those proofs, never asserted.
 *
 * @param schema - The contract the catalog's bundles are proven against.
 * @param provider - The source callbacks answering the listing and retrievals.
 * @returns A {@link Catalog} resolving through the callbacks.
 */
export const defineCatalog = <D extends Definition>(
  schema: Schema<D>,
  provider: Provider,
): Catalog<D> => {
  /**
   * The locales the source serves. Throws {@link MalformedListingError}
   * when the source's answer is not a listing of the contract's locales.
   */
  const list = async (): Promise<Entry<D>[]> => {
    const value: unknown = await provider.list();
    if (!isListing(schema, value)) {
      throw new MalformedListingError(value);
    }
    return value;
  };

  /**
   * One locale's bundle. A locale outside the contract throws the schema's
   * error before the source is asked. A `null` / `undefined` answer is a
   * miss and resolves `undefined`; any other answer is proven against the
   * contract, throwing {@link MalformedBundleError} with the contract's
   * issues when it fails.
   */
  const get = async (locale: Locale<D>): Promise<Bundle<D> | undefined> => {
    schema.assert.locale(locale);

    const value: unknown = await provider.get(locale);
    if (value === null || value === undefined) {
      return undefined;
    }

    try {
      schema.assert.bundle(value);
    } catch (error) {
      if (error instanceof SchemaError) {
        throw new MalformedBundleError(locale, error.issues);
      }
      throw error;
    }

    return value;
  };

  return { list, get };
};
