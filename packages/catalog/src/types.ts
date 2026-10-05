import type { Bundle, Definition, Locale } from "@fibber/schema";

/**
 * A catalog's knowledge of one locale: the identity and display name `list`
 * carries, never the messages. What a language picker renders; the bundle
 * itself stays behind `get` until someone applies it.
 */
export interface Entry<D extends Definition = Definition> {
  /**
   * The locale — the argument `get` takes to retrieve its bundle.
   */
  id: Locale<D>;

  /**
   * The display name, conventionally in the locale's own language.
   */
  name: string;
}

/**
 * A source of locale bundles for a `fibber` service: discovery through
 * `list`, retrieval through `get`. A catalog is a pure resolver — it holds
 * no state, and every call resolves against the underlying source — so
 * caching lives with the caller, where the environment already provides it.
 *
 * Both constructors produce this shape: a provider fronting storage
 * callbacks, a client fronting a remote endpoint speaking the wire
 * protocol. The shapes matching is what lets catalogs chain — a provider's
 * callbacks can delegate to a client, so an app serves its own bundles and
 * falls back to a remote service through one interface.
 */
export interface Catalog<D extends Definition> {
  /**
   * The locales the source serves, each with its display name. The contract
   * bounds the answer — a source lists only locales it declares — but a
   * source need not serve them all.
   */
  list: () => Promise<Entry<D>[]>;

  /**
   * One locale's bundle, proven against the contract. Resolves `undefined`
   * on a miss; a payload that exists but fails the contract throws rather
   * than passing as a miss.
   */
  get: (locale: Locale<D>) => Promise<Bundle<D> | undefined>;
}

/**
 * The storage callbacks a provider catalog fronts — the seam a host binds
 * to wherever its bundles actually live: the JSON `@fibber/kit` emitted, a
 * database, a key-value store, another catalog. Both callbacks return raw
 * untrusted data; the constructor proves every result before the catalog
 * surfaces it, so implementations hand back storage reads as-is, without
 * casting.
 */
export interface Provider {
  /**
   * Answers the listing: returns the entries the source serves — directly
   * or behind a promise, awaited either way — proven as entries of the
   * contract on the way out.
   */
  list: () => unknown;

  /**
   * Answers a retrieval: returns the stored bundle for the locale — directly
   * or behind a promise, awaited either way — proven as a bundle on the way
   * out, with `null` / `undefined` meaning a miss.
   */
  get: (locale: string) => unknown;
}

/**
 * The transport a client catalog speaks through: where to make requests,
 * and what to send with them. The client owns the wire protocol; this
 * config only points it somewhere and authenticates it.
 */
export interface Client {
  /**
   * The URL the wire routes extend — an app's own mount point or a remote
   * service's origin.
   */
  base: string;

  /**
   * Headers sent with every request; authentication lives here.
   */
  headers?: Record<string, string>;

  /**
   * The fetch implementation requests go through. Defaults to the global;
   * the injection point for a request-aware fetch during SSR, or one that
   * carries credentials, retries, or caching.
   */
  fetch?: typeof globalThis.fetch;
}
