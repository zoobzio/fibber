import type { MessageFormatElement } from "@formatjs/icu-messageformat-parser";

import type { FORMATS } from "./constant";

/**
 * One compiled message: the FormatJS AST `@fibber/kit` parsed an ICU message
 * to, which the runtime formats without a parser.
 */
export type Ast = MessageFormatElement[];

/** The kinds of value a named format applies to. */
export type Kind = "number" | "date" | "time";

/**
 * Named formats, by kind: what a message refers to by name
 * (`{amount, number, price}`) and a helper takes in place of options.
 */
export interface Formats {
  readonly number?: Readonly<Record<string, Intl.NumberFormatOptions>>;
  readonly date?: Readonly<Record<string, Intl.DateTimeFormatOptions>>;
  readonly time?: Readonly<Record<string, Intl.DateTimeFormatOptions>>;
}

/**
 * A contract as `@fibber/kit` builds it: the source locale, every locale a
 * bundle exists for, and every message key. Plain data — no message text.
 *
 * `arguments` is a type carrier only: the kit declares it with the values
 * each message takes and never emits it, so a definition infers a typed
 * resolver without holding anything at runtime.
 */
export interface Definition {
  /** The locale the source messages are written in. */
  readonly locale: string;

  /** Every locale a bundle is built for, the source locale first. */
  readonly locales: readonly string[];

  /** Every message key, in source order. */
  readonly messages: readonly string[];

  /** The named formats `fibber.config.ts` declares, by kind. */
  readonly formats?: Formats;

  /** Never present at runtime; carries each message's values in the types. */
  readonly arguments?: object;
}

/** The locales of a contract. */
export type Locale<D extends Definition> = D["locales"][number];

/** The message keys of a contract: what each message goes by. */
export type Key<D extends Definition> = D["messages"][number];

/**
 * The names a format of one kind goes by: the built-in ones, and the ones the
 * contract declares.
 */
export type Named<D extends Definition, K extends Kind> =
  | (typeof FORMATS)[K][number]
  | (D["formats"] extends Readonly<Record<K, infer F>>
      ? keyof F & string
      : never);

/**
 * The values one message takes: read off the contract's `arguments` carrier,
 * or any record when the definition carries none.
 */
export type Values<
  D extends Definition,
  K extends Key<D>,
> = K extends keyof NonNullable<D["arguments"]>
  ? NonNullable<D["arguments"]>[K]
  : Record<string, unknown>;

/**
 * Messages of one locale, compiled: message key to AST. Partial by design —
 * an app may hold the whole locale or only the part it has loaded.
 */
export type Bundle<D extends Definition> = {
  [K in Key<D>]?: Ast;
};

/** One reason a value is not what the contract asks for. */
export interface Issue {
  /** What is wrong. */
  message: string;

  /** Where in the value, when it is not the value itself. */
  path?: string[];
}

/**
 * The validation bundle for a contract: `check` answers as a type guard,
 * `assert` throws a `SchemaError` carrying every issue.
 */
export interface Schema<D extends Definition> {
  /** The contract the schema was derived from. */
  definition: D;

  check: {
    locale: (value: unknown) => value is Locale<D>;
    key: (value: unknown) => value is Key<D>;
    bundle: (value: unknown) => value is Bundle<D>;
    timeZone: (value: unknown) => value is string;
    convention: (value: unknown) => value is string;
  };

  assert: {
    locale: (value: unknown) => asserts value is Locale<D>;
    key: (value: unknown) => asserts value is Key<D>;
    bundle: (value: unknown) => asserts value is Bundle<D>;
    timeZone: (value: unknown) => asserts value is string;
    convention: (value: unknown) => asserts value is string;
  };
}
