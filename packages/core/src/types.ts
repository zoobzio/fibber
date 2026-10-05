import type {
  Bundle,
  Definition,
  Locale,
  Key,
  Named,
  Schema,
  Values,
} from "@fibber/schema";

/**
 * The caller-owned live state a {@link Fibber} service reads and writes: the
 * one locale the app is in, the messages of that locale it holds — the whole
 * bundle, or whatever part has been loaded so far — and how values are
 * formatted. Pass a plain object for inert state, or a reactive proxy to have
 * reads and writes tracked.
 */
export type Config<D extends Definition> = {
  /** The locale the messages are in. */
  locale: Locale<D>;

  /** The messages of that locale the service holds. */
  messages: Bundle<D>;

  /**
   * The IANA time zone dates and times are formatted in, inside messages and
   * by the helpers. Unset, each runtime uses its own — which a server and a
   * browser rarely share.
   */
  timeZone?: string | undefined;

  /**
   * The locale whose conventions values are formatted by, as a BCP 47 tag —
   * region, hour cycle, calendar, numbering (`en-GB-u-hc-h23`) — when they
   * differ from the locale of the messages. Unset, values follow `locale`.
   */
  convention?: string | undefined;
};

/** A handler for a tag in a message: receives what the tag wraps. */
export type Tag = (chunks: string[]) => string;

/**
 * The runtime features of a service: read/write middleware over the state
 * container, and how messages are formatted.
 */
export type Options<D extends Definition> = {
  /**
   * Read middleware: each slot intercepts the matching `config` field and
   * transforms the value on its way out. Omit a slot to pass it through.
   */
  get?: {
    config?: {
      locale?: (locale: Locale<D>) => Locale<D>;
      messages?: (messages: Bundle<D>) => Bundle<D>;
      timeZone?: (timeZone: string | undefined) => string | undefined;
      convention?: (convention: string | undefined) => string | undefined;
    };
  };

  /**
   * Write middleware: each slot intercepts the matching `config` field and
   * transforms the value on its way in. Omit a slot to pass it through.
   */
  set?: {
    config?: {
      locale?: (locale: Locale<D>) => Locale<D>;
      messages?: (messages: Bundle<D>) => Bundle<D>;
      timeZone?: (timeZone: string | undefined) => string | undefined;
      convention?: (convention: string | undefined) => string | undefined;
    };
  };

  /**
   * Tag handlers every message shares, by tag name. A handler passed with a
   * call's values wins over the one here.
   */
  tags?: Record<string, Tag>;

  /**
   * What a message resolves to when the active locale does not hold it — its
   * part of the bundle is not loaded yet. Defaults to the message key.
   */
  onMissing?: (key: Key<D>, locale: Locale<D>) => string;

  /**
   * What a message resolves to when formatting it throws — a value missing
   * or of the wrong kind. Defaults to rethrowing.
   */
  onError?: (error: unknown, key: Key<D>, locale: Locale<D>) => string;
};

/**
 * The arguments a message is called with: its values when it takes any,
 * nothing when it takes none. A contract with no `arguments` carrier accepts
 * any values, or none.
 */
export type Args<D extends Definition, K extends Key<D>> = [
  keyof Values<D, K>,
] extends [never]
  ? []
  : string extends keyof Values<D, K>
    ? [values?: Values<D, K>]
    : [values: Values<D, K>];

/**
 * A message as one piece of data: its key alone when it takes no values —
 * `"title"` — and its key with its values when it does —
 * `["greeting", { name }]`. Each key is paired with its own values, so a
 * message can be held, passed around and resolved later — `$t(message)` —
 * as safely as one written out.
 */
export type Message<D extends Definition> = {
  [K in Key<D>]:
    | ([] extends Args<D, K> ? K : never)
    | (Args<D, K> extends [] ? never : [key: K, ...args: Args<D, K>]);
}[Key<D>];

/** Whether a key type is more than one key — a union, not a single message. */
type Several<K, U = K> = K extends unknown
  ? [U] extends [K]
    ? false
    : true
  : never;

/**
 * Resolves a message by its key, two ways. Written out —
 * `("greeting", { name })` — the values are typed off the one key named; a
 * key that could be any of several messages is refused here, since no one
 * set of values fits them all. Held as data, a {@link Message} is passed
 * whole.
 */
export type Format<D extends Definition> = {
  <K extends Key<D>>(
    key: K,
    ...args: Several<K> extends true ? never : Args<D, K>
  ): string;
  (message: Message<D>): string;
};

/**
 * One level of a {@link Resolver}: a function for every name that completes
 * a message key, and the next level for every name that is a group. `K` is
 * what is left of the keys below the prefix `P`.
 */
type Tree<D extends Definition, K extends string, P extends string = ""> = {
  readonly [H in Exclude<K, `${string}.${string}`>]: (
    ...args: Args<D, `${P}${H}` & Key<D>>
  ) => string;
} & {
  readonly [H in K extends `${infer S}.${string}` ? S : never]: Tree<
    D,
    K extends `${H}.${infer R}` ? R : never,
    `${P}${H}.`
  >;
};

/**
 * The messages of a contract as functions: `$t.greeting({ name })`. A dot
 * in a key is a level of the object, so the message `checkout.cart.title`
 * is `$t.checkout.cart.title()`. Each call formats the message in the
 * locale active at that moment.
 *
 * The resolver is itself a function that takes the whole key:
 * `$t("checkout.cart.title")`, `$t("greeting", { name })` — the same
 * message, values and result as the nested call. A {@link Message} held as
 * data goes in whole: `$t(message)`.
 */
export type Resolver<D extends Definition> = Tree<D, Key<D>> & Format<D>;

/**
 * A runtime translation service over a contract. It holds one locale at a
 * time and never fetches: the caller resolves a bundle from wherever it
 * lives and hands it to `apply` or `load`.
 */
export interface Fibber<D extends Definition> {
  /**
   * The caller-owned live state — the single place state is read or written raw.
   */
  config: Config<D>;

  /**
   * The validation bundle for the contract.
   */
  schema: Schema<D>;

  /**
   * The locales the contract declares, the source locale first.
   */
  locales: () => readonly Locale<D>[];

  /**
   * Whether the active locale holds a message.
   */
  has: (key: Key<D>) => boolean;

  /**
   * Formats a message in the active locale. A message the active locale does
   * not hold resolves through `onMissing`; a formatting failure through
   * `onError`. Takes a key and its values, or a {@link Message}.
   */
  format: Format<D>;

  /**
   * The messages as an object of functions, itself callable by key — what an
   * app assigns to `$t`. Every resolver of a service is the same object.
   */
  createResolver: () => Resolver<D>;

  /**
   * Becomes a locale: adopts the bundle as everything the service holds, and
   * clears the convention — it belonged to the locale being left. Throws
   * `InvalidLocaleError` or `InvalidBundleError` when either steps outside
   * the contract, leaving the active state untouched.
   */
  apply: (locale: Locale<D>, bundle: Bundle<D>) => void;

  /**
   * Adds messages of the active locale to what the service already holds; a
   * key held twice takes the new message. Throws `InvalidBundleError` when
   * the bundle steps outside the contract.
   */
  load: (bundle: Bundle<D>) => void;

  /**
   * Sets the time zone dates and times are formatted in; `undefined` returns
   * to the runtime's own. Throws `InvalidTimeZoneError` for a zone the
   * runtime does not know.
   */
  setTimeZone: (timeZone: string | undefined) => void;

  /**
   * Sets the locale whose conventions values are formatted by; `undefined`
   * returns to the locale of the messages. Throws `InvalidConventionError`
   * for a tag that is not well formed.
   */
  setConvention: (convention: string | undefined) => void;

  /**
   * Formats a number — by a named format, or by options. The same named
   * formats, convention and formatters a message's `{n, number}` goes
   * through.
   */
  number: (
    value: number | bigint,
    format?: Named<D, "number"> | Intl.NumberFormatOptions,
  ) => string;

  /**
   * Formats a date in the active time zone — by a named format, or by
   * options, whose own `timeZone` wins (`UTC` for a calendar date).
   */
  date: (
    value: Date | number,
    format?: Named<D, "date"> | Intl.DateTimeFormatOptions,
  ) => string;

  /**
   * Formats a time of day in the active time zone — by a named format, or by
   * options. With neither, the `medium` format, as `{at, time}` does.
   */
  time: (
    value: Date | number,
    format?: Named<D, "time"> | Intl.DateTimeFormatOptions,
  ) => string;

  /**
   * Formats a span of time relative to now (`3 days ago`). The caller says
   * how far and in which unit: deriving it from the clock would differ
   * between a server render and the browser's.
   */
  relative: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ) => string;

  /** Joins items the way the language lists them (`a, b and c`). */
  list: (items: Iterable<string>, options?: Intl.ListFormatOptions) => string;

  /**
   * The display name of a language, region, script, currency, calendar or
   * date field code (`fr` as `French`); the code itself when it has none.
   */
  name: (code: string, type: Intl.DisplayNamesType) => string;
}
