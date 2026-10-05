import type {
  Ast,
  Bundle,
  Definition,
  Kind,
  Locale,
  Message,
  Schema,
} from "@fibber/schema";
import type { Formatters } from "intl-messageformat";
import type { Config, Fibber, Options, Resolver } from "./types";

import { defineSchema } from "@fibber/schema";
import { IntlMessageFormat } from "intl-messageformat";
import {
  InvalidBundleError,
  InvalidConventionError,
  InvalidLocaleError,
  InvalidTimeZoneError,
  UnknownFormatError,
  reframe,
} from "./error";

/**
 * Builds the runtime {@link Fibber} service over a state container, for the
 * contract `@fibber/kit` built. The container's locale and bundle are
 * validated against the contract up front.
 *
 * Every read and write goes through `proxy`, so the caller decides whether
 * state is plain (tests, node) or a reactive proxy (Vue); `options` can
 * intercept each read and write on the way through. A message is looked up
 * and formatted when it is called, never ahead of time — so a call made
 * inside a reactive scope re-runs when `apply` or `load` changes the state.
 *
 * The service never fetches. A bundle arrives through `apply` (become a
 * locale) or `load` (add to the active one), from wherever the caller keeps
 * them.
 *
 * @param definition - The contract: the kit's `contract` export.
 * @param config - The caller-owned container: active locale and its messages.
 * Values are formatted the same way wherever they appear: a message's
 * `{at, date}` and the `date` helper share the contract's named formats, the
 * container's time zone and convention, and one set of `Intl` formatters.
 *
 * @param options - Middleware over `config`, and how messages are formatted.
 * @returns A {@link Fibber} service bound to the container.
 * @throws InvalidLocaleError when the container's locale is not in the contract.
 * @throws InvalidBundleError when the container's messages step outside it.
 * @throws InvalidTimeZoneError when the container's time zone is not a zone.
 * @throws InvalidConventionError when the container's convention is not a tag.
 */
export const makeFibber = <D extends Definition>(
  definition: D,
  config: Config<D>,
  options: Options<D> = {},
): Fibber<D> => {
  /**
   * The active state, fronted by get/set middleware. The container stays the
   * source of truth; a missing middleware is a passthrough.
   */
  const proxy: Config<D> = {
    get locale() {
      const through = options.get?.config?.locale;
      if (through) {
        return through(config.locale);
      }
      return config.locale;
    },
    set locale(value) {
      const through = options.set?.config?.locale;
      if (through) {
        config.locale = through(value);
        return;
      }
      config.locale = value;
    },
    get messages() {
      const through = options.get?.config?.messages;
      if (through) {
        return through(config.messages);
      }
      return config.messages;
    },
    set messages(value) {
      const through = options.set?.config?.messages;
      if (through) {
        config.messages = through(value);
        return;
      }
      config.messages = value;
    },
    get timeZone() {
      const through = options.get?.config?.timeZone;
      if (through) {
        return through(config.timeZone);
      }
      return config.timeZone;
    },
    set timeZone(value) {
      const through = options.set?.config?.timeZone;
      if (through) {
        config.timeZone = through(value);
        return;
      }
      config.timeZone = value;
    },
    get convention() {
      const through = options.get?.config?.convention;
      if (through) {
        return through(config.convention);
      }
      return config.convention;
    },
    set convention(value) {
      const through = options.set?.config?.convention;
      if (through) {
        config.convention = through(value);
        return;
      }
      config.convention = value;
    },
  };

  const schema: Schema<D> = defineSchema(definition);

  /** Proves a time zone, `undefined` — the runtime's own — always passing. */
  const assertTimeZone = (timeZone: string | undefined) => {
    if (timeZone !== undefined) {
      reframe(InvalidTimeZoneError, () => schema.assert.timeZone(timeZone));
    }
  };

  /** Proves a convention, `undefined` — the locale's own — always passing. */
  const assertConvention = (convention: string | undefined) => {
    if (convention !== undefined) {
      reframe(InvalidConventionError, () =>
        schema.assert.convention(convention),
      );
    }
  };

  reframe(InvalidLocaleError, () => schema.assert.locale(proxy.locale));
  reframe(InvalidBundleError, () => schema.assert.bundle(proxy.messages));
  assertTimeZone(proxy.timeZone);
  assertConvention(proxy.convention);

  /**
   * Every named format: FormatJS's defaults under the contract's own. What a
   * message's `{n, number, price}` and a helper's `"price"` both resolve
   * through.
   */
  const formats = {
    number: {
      ...IntlMessageFormat.formats.number,
      ...definition.formats?.number,
    },
    date: { ...IntlMessageFormat.formats.date, ...definition.formats?.date },
    time: { ...IntlMessageFormat.formats.time, ...definition.formats?.time },
  };

  /**
   * Every `Intl` formatter the service has built, by constructor, locale and
   * options. Construction is the slow part of formatting, so each is built
   * once and shared by the messages and the helpers.
   */
  const built = new Map<string, unknown>();

  /** The memoized `Intl` formatter for a locale and options. */
  const intl = <T>(
    Constructor: new (locale: string, options: never) => T,
    locale: string,
    formatOptions: object | undefined,
  ): T => {
    const key = `${Constructor.name}|${locale}|${JSON.stringify(formatOptions ?? {})}`;
    let found = built.get(key) as T | undefined;
    if (found === undefined) {
      found = new Constructor(locale, formatOptions as never);
      built.set(key, found);
    }
    return found;
  };

  /** The locale values are formatted by: the convention, else the locale. */
  const convention = (): string => proxy.convention ?? proxy.locale;

  /**
   * Date and time options under the active time zone; options that name
   * their own keep it.
   */
  const zoned = (
    formatOptions: Intl.DateTimeFormatOptions | undefined,
  ): Intl.DateTimeFormatOptions | undefined => {
    const timeZone = proxy.timeZone;
    if (timeZone === undefined) {
      return formatOptions;
    }
    return { timeZone, ...formatOptions };
  };

  /** The number formatter for options, by the active convention. */
  const numbers = (formatOptions: object | undefined): Intl.NumberFormat => {
    return intl(Intl.NumberFormat, convention(), formatOptions);
  };

  /** The date formatter for options, by the active convention and zone. */
  const dates = (
    formatOptions: Intl.DateTimeFormatOptions | undefined,
  ): Intl.DateTimeFormat => {
    return intl(Intl.DateTimeFormat, convention(), zoned(formatOptions));
  };

  /**
   * The formatters every message formats its values through, in place of
   * FormatJS's own: numbers and dates follow the convention and the time
   * zone active at the moment of the call, whatever locale the message was
   * compiled for. Plural rules stay with the message's locale — which form a
   * message takes is a matter of its language, not of the reader's region.
   */
  const formatters: Formatters = {
    getNumberFormat: (_locales, formatOptions) => numbers(formatOptions),
    getDateTimeFormat: (_locales, formatOptions) => dates(formatOptions),
    getPluralRules: (_locales, formatOptions) =>
      intl(Intl.PluralRules, proxy.locale, formatOptions),
  };

  /**
   * The formatter of each compiled message, per locale, keyed by the AST
   * itself — a bundle that is replaced takes its formatters with it.
   */
  const compiled = new Map<string, WeakMap<Ast, IntlMessageFormat>>();

  /** The memoized formatter for a compiled message in a locale. */
  const formatter = (locale: Locale<D>, ast: Ast): IntlMessageFormat => {
    let cache = compiled.get(locale);
    if (cache === undefined) {
      cache = new WeakMap();
      compiled.set(locale, cache);
    }
    let found = cache.get(ast);
    if (found === undefined) {
      // FormatJS types its number options more narrowly than the platform's.
      found = new IntlMessageFormat(ast, locale, formats as never, {
        formatters,
      });
      cache.set(ast, found);
    }
    return found;
  };

  /** The compiled message the active locale holds under a key, if any. */
  const lookup = (message: Message<D>): Ast | undefined => {
    const messages = proxy.messages;
    if (!Object.hasOwn(messages, message)) {
      return undefined;
    }
    return messages[message];
  };

  const locales = () => definition.locales;

  const has = (message: Message<D>) => lookup(message) !== undefined;

  /**
   * Formats a message in the active locale: shared tag handlers under the
   * call's own values, the formatter's parts joined to one string.
   */
  const format = (message: Message<D>, values?: unknown): string => {
    const locale = proxy.locale;
    const ast = lookup(message);
    if (ast === undefined) {
      return options.onMissing?.(message, locale) ?? message;
    }
    try {
      const result = formatter(locale, ast).format<string>({
        ...options.tags,
        ...(typeof values === "object" ? values : undefined),
      });
      return Array.isArray(result) ? result.join("") : result;
    } catch (error) {
      if (options.onError) {
        return options.onError(error, message, locale);
      }
      throw error;
    }
  };

  /**
   * The groups of the contract — every prefix messages nest under, the root
   * as the empty one — each with the names directly inside it. A dot in a
   * message key is a level: `checkout.cart.title` sits in `checkout.cart.`.
   */
  const groups = new Map<string, Set<string>>();
  for (const message of definition.messages) {
    let prefix = "";
    for (const segment of message.split(".")) {
      let names = groups.get(prefix);
      if (names === undefined) {
        names = new Set();
        groups.set(prefix, names);
      }
      names.add(segment);
      prefix = `${prefix}${segment}.`;
    }
  }

  /**
   * One function per message and one object per group, made on first access
   * and kept, so a resolver hands out stable references. A property that is
   * neither reads as `undefined`: the resolver stays inert to whatever
   * probes it (`then`, framework internals) rather than answering as a
   * message.
   */
  const functions = new Map<string, (values?: unknown) => string>();
  const levels = new Map<string, object>();
  const level = (prefix: string): object => {
    const kept = levels.get(prefix);
    if (kept !== undefined) {
      return kept;
    }
    const names = groups.get(prefix) ?? new Set<string>();
    const holds = (property: string | symbol): property is string =>
      typeof property === "string" && names.has(property);
    const made = new Proxy(Object.create(null) as object, {
      get: (_target, property) => {
        if (!holds(property)) {
          return undefined;
        }
        const key = `${prefix}${property}`;
        if (!schema.check.message(key)) {
          return level(`${key}.`);
        }
        let found = functions.get(key);
        if (found === undefined) {
          found = (values) => format(key, values);
          functions.set(key, found);
        }
        return found;
      },
      has: (_target, property) => holds(property),
      ownKeys: () => [...names],
      getOwnPropertyDescriptor: (_target, property) => {
        if (!holds(property)) {
          return undefined;
        }
        return { enumerable: true, configurable: true };
      },
      set: () => false,
      defineProperty: () => false,
      deleteProperty: () => false,
    });
    levels.set(prefix, made);
    return made;
  };
  const resolver = level("") as Resolver<D>;

  const createResolver = () => resolver;

  /**
   * Becomes a locale. Both arguments are proven before anything is written,
   * so a rejected call leaves the active state as it was. The convention is
   * cleared: it was chosen for the locale being left, and values formatted
   * by one language's conventions inside another's messages read as a bug.
   */
  const apply = (locale: Locale<D>, bundle: Bundle<D>) => {
    reframe(InvalidLocaleError, () => schema.assert.locale(locale));
    reframe(InvalidBundleError, () => schema.assert.bundle(bundle));
    proxy.messages = bundle;
    proxy.locale = locale;
    proxy.convention = undefined;
  };

  /**
   * Adds to the active locale, replacing the held bundle rather than writing
   * into it so reactive reads re-resolve.
   */
  const load = (bundle: Bundle<D>) => {
    reframe(InvalidBundleError, () => schema.assert.bundle(bundle));
    proxy.messages = { ...proxy.messages, ...bundle };
  };

  const setTimeZone = (timeZone: string | undefined) => {
    assertTimeZone(timeZone);
    proxy.timeZone = timeZone;
  };

  const setConvention = (next: string | undefined) => {
    assertConvention(next);
    proxy.convention = next;
  };

  /**
   * The options a helper formats by: a name resolves through the contract's
   * formats, options pass through, and neither is the kind's default.
   */
  const style = <O extends object>(
    kind: Kind,
    format: unknown,
  ): O | undefined => {
    if (typeof format !== "string") {
      return format as O | undefined;
    }
    const named: Record<string, object> = formats[kind];
    if (!Object.hasOwn(named, format)) {
      throw new UnknownFormatError(kind, format);
    }
    return named[format] as O;
  };

  const number: Fibber<D>["number"] = (value, format) => {
    return numbers(style("number", format)).format(value);
  };

  const date: Fibber<D>["date"] = (value, format) => {
    return dates(style("date", format)).format(value);
  };

  const time: Fibber<D>["time"] = (value, format) => {
    return dates(style("time", format ?? "medium")).format(value);
  };

  const relative: Fibber<D>["relative"] = (value, unit, formatOptions) => {
    return intl(Intl.RelativeTimeFormat, convention(), formatOptions).format(
      value,
      unit,
    );
  };

  const list: Fibber<D>["list"] = (items, formatOptions) => {
    return intl(Intl.ListFormat, convention(), formatOptions).format(items);
  };

  const name: Fibber<D>["name"] = (code, type) => {
    try {
      return intl(Intl.DisplayNames, convention(), { type }).of(code) ?? code;
    } catch {
      // A code malformed for its type has no name either.
      return code;
    }
  };

  return {
    config: proxy,
    schema,
    locales,
    has,
    format,
    createResolver,
    apply,
    load,
    setTimeZone,
    setConvention,
    number,
    date,
    time,
    relative,
    list,
    name,
  };
};
