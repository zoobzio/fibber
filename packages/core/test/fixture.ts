import type { Ast } from "@fibber/schema";

import { compile } from "@fibber/kit";

/** What each fixture message takes — the shape the kit declares. */
interface Arguments {
  greeting: { name: string | number };
  title: Record<never, never>;
  inbox: { count: number };
  terms: { link: (chunks: string[]) => string };
  price: { amount: number };
  seen: { at: Date | number };
}

/** A contract as the kit emits it: plain data, the values carried in the types. */
export const contract: {
  readonly locale: "en";
  readonly locales: readonly ("en" | "fr")[];
  readonly messages: readonly (keyof Arguments)[];
  readonly formats: {
    readonly number: { readonly price: Intl.NumberFormatOptions };
    readonly date: { readonly day: Intl.DateTimeFormatOptions };
    readonly time: Record<never, never>;
  };
  readonly arguments?: Arguments;
} = {
  locale: "en",
  locales: ["en", "fr"],
  messages: ["greeting", "title", "inbox", "terms", "price", "seen"],
  formats: {
    number: { price: { style: "currency", currency: "EUR" } },
    date: { day: { dateStyle: "medium", timeZone: "UTC" } },
    time: {},
  },
};

/** Compiles a map of ICU messages the way the kit builds a bundle. */
const bundle = <K extends string>(messages: Record<K, string>) => {
  const compiled = {} as Record<K, Ast>;
  for (const key of Object.keys(messages) as K[]) {
    const result = compile(messages[key]);
    if (!result.ok) {
      throw new Error(result.issues.join("; "));
    }
    compiled[key] = result.value.ast;
  }
  return compiled;
};

export const en = bundle({
  greeting: "Hello, {name}!",
  title: "Welcome",
  inbox: "{count, plural, one {# new message} other {# new messages}}",
  terms: "Read the <link>terms</link>",
  price: "{amount, number, price}",
  seen: "Seen {at, date, medium} at {at, time, short}",
});

export const fr = bundle({
  greeting: "Bonjour, {name} !",
  title: "Bienvenue",
  inbox: "{count, plural, one {# nouveau message} other {# nouveaux messages}}",
  terms: "Lisez les <link>conditions</link>",
  price: "{amount, number, price}",
  seen: "Vu le {at, date, medium} à {at, time, short}",
});

/** What each message of the nested fixture takes. */
interface NestedArguments {
  title: Record<never, never>;
  "checkout.total": { amount: number };
  "checkout.cart.empty": Record<never, never>;
  "checkout.cart.items": { count: number };
}

/** A contract whose keys nest, as the kit emits one for a source directory. */
export const nested: {
  readonly locale: "en";
  readonly locales: readonly "en"[];
  readonly messages: readonly (keyof NestedArguments)[];
  readonly formats: {
    readonly number: Record<never, never>;
    readonly date: Record<never, never>;
    readonly time: Record<never, never>;
  };
  readonly arguments?: NestedArguments;
} = {
  locale: "en",
  locales: ["en"],
  messages: [
    "title",
    "checkout.total",
    "checkout.cart.empty",
    "checkout.cart.items",
  ],
  formats: { number: {}, date: {}, time: {} },
};

export const nestedEn = bundle({
  title: "Welcome",
  "checkout.total": "Total: {amount, number}",
  "checkout.cart.empty": "Your cart is empty",
  "checkout.cart.items": "{count, plural, one {# item} other {# items}}",
});
