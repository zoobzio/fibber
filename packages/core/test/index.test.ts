import type { Bundle, Key } from "@fibber/schema";

import { FORMATS } from "@fibber/schema";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { Message, Config } from "../src/types";
import {
  InvalidBundleError,
  InvalidConventionError,
  InvalidLocaleError,
  InvalidTimeZoneError,
  UnknownFormatError,
} from "../src/error";
import { makeFibber } from "../src/factory";
import { contract, en, fr, nested, nestedEn } from "./fixture";

type Contract = typeof contract;

/** A fresh plain container in English, holding the whole bundle. */
const container = (): Config<Contract> => ({ locale: "en", messages: en });

describe("makeFibber", () => {
  it("validates the container it is given", () => {
    expect(() =>
      makeFibber(contract, { locale: "de" as "en", messages: en }),
    ).toThrow(InvalidLocaleError);
    expect(() =>
      makeFibber(contract, {
        locale: "en",
        messages: { retired: [] } as Bundle<Contract>,
      }),
    ).toThrow(InvalidBundleError);
  });

  it("lists the contract's locales", () => {
    expect(makeFibber(contract, container()).locales()).toEqual(["en", "fr"]);
  });
});

describe("format", () => {
  it("formats a message in the active locale", () => {
    const fibber = makeFibber(contract, container());
    expect(fibber.format("title")).toBe("Welcome");
    expect(fibber.format("greeting", { name: "Ada" })).toBe("Hello, Ada!");
    expect(fibber.format("inbox", { count: 1 })).toBe("1 new message");
    expect(fibber.format("inbox", { count: 2 })).toBe("2 new messages");
  });

  it("passes what a tag wraps to its handler", () => {
    const fibber = makeFibber(contract, container());
    expect(
      fibber.format("terms", { link: (chunks) => `[${chunks.join("")}]` }),
    ).toBe("Read the [terms]");
  });

  it("resolves a message the locale does not hold to its key", () => {
    const fibber = makeFibber(contract, { locale: "en", messages: {} });
    expect(fibber.has("title")).toBe(false);
    expect(fibber.format("title")).toBe("title");
  });

  it("rethrows a formatting failure", () => {
    const fibber = makeFibber(contract, container());
    expect(() => fibber.format("greeting", {} as { name: string })).toThrow(
      /name/,
    );
  });
});

describe("options", () => {
  it("resolves a missing message through onMissing", () => {
    const onMissing = vi.fn(() => "…");
    const fibber = makeFibber(
      contract,
      { locale: "fr", messages: {} },
      { onMissing },
    );
    expect(fibber.format("title")).toBe("…");
    expect(onMissing).toHaveBeenCalledWith("title", "fr");
  });

  it("resolves a formatting failure through onError", () => {
    const onError = vi.fn(() => "?");
    const fibber = makeFibber(contract, container(), { onError });
    expect(fibber.format("greeting", {} as { name: string })).toBe("?");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "greeting", "en");
  });

  it("shares tag handlers across messages, a call's own winning", () => {
    const fibber = makeFibber(contract, container(), {
      tags: { link: (chunks) => `<a>${chunks.join("")}</a>` },
    });
    const $t = fibber.createResolver();
    expect(fibber.format("terms", undefined as never)).toBe(
      "Read the <a>terms</a>",
    );
    expect($t.terms({ link: (chunks) => chunks.join("").toUpperCase() })).toBe(
      "Read the TERMS",
    );
  });

  it("threads every read and write through the middleware", () => {
    const state = container();
    const reads: string[] = [];
    const fibber = makeFibber(contract, state, {
      get: {
        config: {
          locale: (locale) => (reads.push("locale"), locale),
          messages: (messages) => (reads.push("messages"), messages),
        },
      },
      set: { config: { locale: () => "en", messages: () => ({}) } },
    });
    reads.length = 0;
    fibber.format("title");
    expect(reads).toEqual(["locale", "messages"]);
    fibber.apply("fr", fr);
    expect(state).toEqual({
      locale: "en",
      messages: {},
      convention: undefined,
    });
  });
});

describe("createResolver", () => {
  it("exposes each message as a function", () => {
    const $t = makeFibber(contract, container()).createResolver();
    expect($t.title()).toBe("Welcome");
    expect($t.greeting({ name: "Ada" })).toBe("Hello, Ada!");
    expect($t.inbox({ count: 3 })).toBe("3 new messages");
  });

  it("types each call off the contract", () => {
    const $t = makeFibber(contract, container()).createResolver();
    expectTypeOf($t.title).toEqualTypeOf<() => string>();
    expectTypeOf($t.greeting).toEqualTypeOf<
      (values: { name: string | number }) => string
    >();
    // Compiled, never run: each line must be a type error.
    const misuse = () => {
      // @ts-expect-error a message that takes values cannot be called without
      $t.inbox();
      // @ts-expect-error count is a number
      $t.inbox({ count: "3" });
      // @ts-expect-error not a message of the contract
      $t.nope();
    };
    expect(misuse).toBeTypeOf("function");
  });

  it("hands out one resolver, with stable functions", () => {
    const fibber = makeFibber(contract, container());
    const $t = fibber.createResolver();
    expect(fibber.createResolver()).toBe($t);
    expect($t.title).toBe($t.title);
  });

  it("answers only for messages of the contract", () => {
    const $t = makeFibber(contract, container()).createResolver();
    const probe = $t as unknown as Record<string | symbol, unknown>;
    expect(probe.then).toBeUndefined();
    expect(probe.toString).toBeUndefined();
    expect(probe[Symbol.iterator]).toBeUndefined();
    expect("title" in $t).toBe(true);
    expect("then" in $t).toBe(false);
    expect(Object.keys($t)).toEqual(contract.messages);
  });

  it("cannot be written to", () => {
    const $t = makeFibber(contract, container()).createResolver();
    expect(() => {
      ($t as unknown as Record<string, unknown>).title = () => "x";
    }).toThrow(TypeError);
    expect($t.title()).toBe("Welcome");
  });

  it("follows the active locale, call by call", () => {
    const fibber = makeFibber(contract, container());
    const $t = fibber.createResolver();
    const { greeting } = $t;
    expect(greeting({ name: "Ada" })).toBe("Hello, Ada!");
    fibber.apply("fr", fr);
    expect(greeting({ name: "Ada" })).toBe("Bonjour, Ada !");
    expect($t.inbox({ count: 2 })).toBe("2 nouveaux messages");
  });

  it("nests a message under each dot of its key", () => {
    const fibber = makeFibber(nested, { locale: "en", messages: nestedEn });
    const $t = fibber.createResolver();
    expect($t.title()).toBe("Welcome");
    expect($t.checkout.total({ amount: 5 })).toBe("Total: 5");
    expect($t.checkout.cart.empty()).toBe("Your cart is empty");
    expect($t.checkout.cart.items({ count: 2 })).toBe("2 items");
    expect(fibber.format("checkout.cart.items", { count: 1 })).toBe("1 item");
  });

  it("types a nested call off the contract", () => {
    const $t = makeFibber(nested, {
      locale: "en",
      messages: nestedEn,
    }).createResolver();
    expectTypeOf($t.checkout.cart.empty).toEqualTypeOf<() => string>();
    expectTypeOf($t.checkout.cart.items).toEqualTypeOf<
      (values: { count: number }) => string
    >();
    // Compiled, never run: each line must be a type error.
    const misuse = () => {
      // @ts-expect-error a group is not a message
      $t.checkout();
      // @ts-expect-error count is a number
      $t.checkout.cart.items({ count: "2" });
      // @ts-expect-error not a message of the group
      $t.checkout.cart.nope();
    };
    expect(misuse).toBeTypeOf("function");
  });

  it("resolves a message by its key when called", () => {
    const fibber = makeFibber(nested, { locale: "en", messages: nestedEn });
    const $t = fibber.createResolver();
    expect($t("title")).toBe("Welcome");
    expect($t("checkout.total", { amount: 5 })).toBe("Total: 5");
    expect($t("checkout.cart.items", { count: 2 })).toBe(
      $t.checkout.cart.items({ count: 2 }),
    );
    expect(Object.keys($t)).toEqual(["title", "checkout"]);
  });

  it("types a call by key off the contract", () => {
    const $t = makeFibber(nested, {
      locale: "en",
      messages: nestedEn,
    }).createResolver();
    expectTypeOf($t("checkout.cart.empty")).toEqualTypeOf<string>();
    // Compiled, never run: each line must be a type error.
    const misuse = () => {
      // @ts-expect-error a message that takes values cannot be called without
      $t("checkout.cart.items");
      // @ts-expect-error count is a number
      $t("checkout.cart.items", { count: "2" });
      // @ts-expect-error a group is not a message
      $t("checkout.cart");
      // @ts-expect-error not a message of the contract
      $t("nope");
    };
    expect(misuse).toBeTypeOf("function");
  });

  it("resolves a message held as data", () => {
    const fibber = makeFibber(nested, { locale: "en", messages: nestedEn });
    const $t = fibber.createResolver();
    const messages: Message<typeof nested>[] = [
      "title",
      ["checkout.cart.items", { count: 2 }],
    ];
    expect(messages.map((message) => $t(message))).toEqual([
      "Welcome",
      "2 items",
    ]);
    expect(messages.map((message) => fibber.format(message))).toEqual([
      "Welcome",
      "2 items",
    ]);
  });

  it("pairs each key of a message with its own values", () => {
    const $t = makeFibber(nested, {
      locale: "en",
      messages: nestedEn,
    }).createResolver();
    expectTypeOf<Message<typeof nested>>().toEqualTypeOf<
      | "title"
      | [key: "checkout.total", values: { amount: number }]
      | "checkout.cart.empty"
      | [key: "checkout.cart.items", values: { count: number }]
    >();
    // Compiled, never run: each line must be a type error.
    const misuse = (
      key: Key<typeof nested>,
      plain: "title" | "checkout.cart.empty",
    ) => {
      // A key of messages that all take nothing is safe on its own.
      $t(plain);
      // @ts-expect-error a key of any message may be one that takes values
      $t(key);
      // @ts-expect-error a message that takes values cannot be held without
      const bare: Message<typeof nested> = "checkout.cart.items";
      // @ts-expect-error nor as a list of its key alone
      const short: Message<typeof nested> = ["checkout.cart.items"];
      // @ts-expect-error the values of another message
      const mixed: Message<typeof nested> = ["checkout.total", { count: 2 }];
      // @ts-expect-error a message that takes none
      const extra: Message<typeof nested> = ["title", { count: 2 }];
      return [bare, short, mixed, extra];
    };
    expect(misuse).toBeTypeOf("function");
  });

  it("resolves by key through the active locale and the options", () => {
    const onMissing = vi.fn(() => "…");
    const fibber = makeFibber(contract, container(), {
      onMissing,
      tags: { link: (chunks) => `<a>${chunks.join("")}</a>` },
    });
    const $t = fibber.createResolver();
    expect($t("terms", undefined as never)).toBe("Read the <a>terms</a>");
    fibber.apply("fr", { title: fr.title });
    expect($t("title")).toBe("Bienvenue");
    expect($t("greeting", { name: "Ada" })).toBe("…");
    expect(onMissing).toHaveBeenCalledWith("greeting", "fr");
  });

  it("hands out stable groups that answer only for what they hold", () => {
    const $t = makeFibber(nested, {
      locale: "en",
      messages: nestedEn,
    }).createResolver();
    expect($t.checkout).toBe($t.checkout);
    expect($t.checkout.cart.items).toBe($t.checkout.cart.items);
    expect(Object.keys($t)).toEqual(["title", "checkout"]);
    expect(Object.keys($t.checkout)).toEqual(["total", "cart"]);
    const probe = $t.checkout as unknown as Record<string | symbol, unknown>;
    expect(probe.then).toBeUndefined();
    expect(probe.title).toBeUndefined();
    expect("cart" in $t.checkout).toBe(true);
    expect("title" in $t.checkout).toBe(false);
  });
});

describe("apply", () => {
  it("becomes the locale, holding only the bundle it was given", () => {
    const state = container();
    const fibber = makeFibber(contract, state);
    fibber.apply("fr", { title: fr.title });
    expect(state.locale).toBe("fr");
    expect(fibber.config.locale).toBe("fr");
    expect(fibber.has("title")).toBe(true);
    expect(fibber.has("greeting")).toBe(false);
  });

  it("leaves the state untouched when it rejects", () => {
    const state = container();
    const fibber = makeFibber(contract, state);
    expect(() => fibber.apply("de" as "fr", fr)).toThrow(InvalidLocaleError);
    expect(() =>
      fibber.apply("fr", {
        title: "Bienvenue",
      } as unknown as Bundle<Contract>),
    ).toThrow(InvalidBundleError);
    expect(state).toEqual({ locale: "en", messages: en });
  });
});

describe("load", () => {
  it("adds to what the active locale holds, replacing the container's bundle", () => {
    const state: Config<Contract> = { locale: "en", messages: {} };
    const fibber = makeFibber(contract, state);
    const before = state.messages;
    fibber.load({ title: en.title });
    fibber.load({ greeting: en.greeting });
    expect(state.messages).not.toBe(before);
    expect(fibber.format("title")).toBe("Welcome");
    expect(fibber.format("greeting", { name: "Ada" })).toBe("Hello, Ada!");
  });

  it("takes the new message for a key held twice", () => {
    const fibber = makeFibber(contract, container());
    fibber.load({ title: fr.title });
    expect(fibber.format("title")).toBe("Bienvenue");
  });

  it("rejects a bundle outside the contract", () => {
    const fibber = makeFibber(contract, container());
    expect(() => fibber.load({ retired: [] } as Bundle<Contract>)).toThrow(
      InvalidBundleError,
    );
  });
});

/** 2026-01-05T23:30:00Z: still the 5th in UTC, already the 6th in Tokyo. */
const LATE = Date.UTC(2026, 0, 5, 23, 30);

describe("formats", () => {
  it("resolves a message's named format through the contract", () => {
    const fibber = makeFibber(contract, container());
    expect(fibber.format("price", { amount: 5 })).toBe("€5.00");
  });

  it("keeps FormatJS's built-in formats under the contract's", () => {
    const fibber = makeFibber(contract, { ...container(), timeZone: "UTC" });
    expect(fibber.format("seen", { at: LATE })).toBe(
      "Seen Jan 5, 2026 at 11:30 PM",
    );
    expect(
      FORMATS.number.every((name) => name in IntlMessageFormat.formats.number),
    ).toBe(true);
    expect(
      FORMATS.date.every((name) => name in IntlMessageFormat.formats.date),
    ).toBe(true);
    expect(
      FORMATS.time.every((name) => name in IntlMessageFormat.formats.time),
    ).toBe(true);
  });
});

describe("time zone", () => {
  it("validates the container's time zone", () => {
    expect(() =>
      makeFibber(contract, { ...container(), timeZone: "Mars/Olympus" }),
    ).toThrow(InvalidTimeZoneError);
  });

  it("formats dates inside messages in the active time zone", () => {
    const fibber = makeFibber(contract, { ...container(), timeZone: "UTC" });
    expect(fibber.format("seen", { at: LATE })).toContain("Jan 5, 2026");
    fibber.setTimeZone("Asia/Tokyo");
    expect(fibber.format("seen", { at: LATE })).toBe(
      "Seen Jan 6, 2026 at 8:30 AM",
    );
  });

  it("formats the helpers in the same time zone", () => {
    const fibber = makeFibber(contract, {
      ...container(),
      timeZone: "Asia/Tokyo",
    });
    expect(fibber.date(LATE, "medium")).toBe("Jan 6, 2026");
    expect(fibber.time(LATE, "short")).toBe("8:30 AM");
    expect(fibber.time(LATE)).toBe("8:30:00 AM");
  });

  it("lets a format's own time zone win, for calendar dates", () => {
    const fibber = makeFibber(contract, {
      ...container(),
      timeZone: "Asia/Tokyo",
    });
    expect(fibber.date(LATE, "day")).toBe("Jan 5, 2026");
    expect(fibber.date(LATE, { dateStyle: "medium", timeZone: "UTC" })).toBe(
      "Jan 5, 2026",
    );
  });

  it("rejects a zone the runtime does not know, keeping the active one", () => {
    const state = { ...container(), timeZone: "UTC" };
    const fibber = makeFibber(contract, state);
    expect(() => fibber.setTimeZone("Mars/Olympus")).toThrow(
      InvalidTimeZoneError,
    );
    expect(state.timeZone).toBe("UTC");
    fibber.setTimeZone(undefined);
    expect(state.timeZone).toBeUndefined();
  });
});

describe("convention", () => {
  it("validates the container's convention", () => {
    expect(() =>
      makeFibber(contract, { ...container(), convention: "not a locale" }),
    ).toThrow(InvalidConventionError);
  });

  it("formats values by the convention, messages staying in the locale", () => {
    const fibber = makeFibber(contract, { ...container(), timeZone: "UTC" });
    fibber.setConvention("en-GB-u-hc-h23");
    expect(fibber.format("seen", { at: LATE })).toBe(
      "Seen 5 Jan 2026 at 23:30",
    );
    expect(fibber.date(LATE, "short")).toBe("05/01/26");
    expect(fibber.number(1234.5)).toBe("1,234.5");
    fibber.setConvention("de-DE");
    expect(fibber.number(1234.5)).toBe("1.234,5");
  });

  it("keeps plural rules with the message's language", () => {
    const fibber = makeFibber(contract, { locale: "fr", messages: fr });
    // French counts 0 as singular; English, the convention here, does not.
    fibber.setConvention("en");
    expect(fibber.format("inbox", { count: 0 })).toBe("0 nouveau message");
  });

  it("is cleared when the locale changes", () => {
    const state = container();
    const fibber = makeFibber(contract, state);
    fibber.setConvention("en-GB");
    fibber.setTimeZone("UTC");
    fibber.apply("fr", fr);
    expect(state.convention).toBeUndefined();
    expect(state.timeZone).toBe("UTC");
    expect(fibber.date(LATE, "medium")).toBe("5 janv. 2026");
  });

  it("rejects a malformed tag, keeping the active one", () => {
    const state = container();
    const fibber = makeFibber(contract, state);
    fibber.setConvention("en-GB");
    expect(() => fibber.setConvention("not a locale")).toThrow(
      InvalidConventionError,
    );
    expect(state.convention).toBe("en-GB");
  });
});

describe("helpers", () => {
  it("formats numbers by a named format or by options", () => {
    const fibber = makeFibber(contract, container());
    expect(fibber.number(1234.5)).toBe("1,234.5");
    expect(fibber.number(5, "price")).toBe("€5.00");
    expect(fibber.number(0.25, "percent")).toBe("25%");
    expect(fibber.number(5, { minimumFractionDigits: 2 })).toBe("5.00");
    expect(fibber.number(12345678901234567890n)).toBe(
      "12,345,678,901,234,567,890",
    );
  });

  it("types format names off the contract", () => {
    const fibber = makeFibber(contract, container());
    // Compiled, never run: each line must be a type error.
    const misuse = () => {
      // @ts-expect-error not a number format of the contract
      fibber.number(5, "prix");
      // @ts-expect-error price is a number format, not a date format
      fibber.date(0, "price");
    };
    expect(misuse).toBeTypeOf("function");
  });

  it("throws for a format name the contract does not have", () => {
    const fibber = makeFibber(contract, container());
    expect(() => fibber.number(5, "prix" as "price")).toThrow(
      UnknownFormatError,
    );
    expect(() => fibber.number(5, "toString" as "price")).toThrow(
      UnknownFormatError,
    );
  });

  it("formats relative time, lists and display names in the locale", () => {
    const fibber = makeFibber(contract, container());
    expect(fibber.relative(-3, "day")).toBe("3 days ago");
    expect(fibber.relative(-1, "day", { numeric: "auto" })).toBe("yesterday");
    expect(fibber.list(["a", "b", "c"])).toBe("a, b, and c");
    expect(fibber.list(["a", "b"], { type: "disjunction" })).toBe("a or b");
    expect(fibber.name("fr", "language")).toBe("French");
    expect(fibber.name("JP", "region")).toBe("Japan");
    fibber.apply("fr", fr);
    expect(fibber.relative(-3, "day")).toBe("il y a 3 jours");
    expect(fibber.list(["a", "b", "c"])).toBe("a, b et c");
    expect(fibber.name("fr", "language")).toBe("français");
  });

  it("answers a code with no display name with the code", () => {
    const fibber = makeFibber(contract, container());
    expect(fibber.name("not a code", "language")).toBe("not a code");
  });

  it("builds each Intl formatter once", () => {
    const fibber = makeFibber(contract, container());
    const spy = vi.spyOn(Intl, "NumberFormat");
    fibber.number(1, "price");
    fibber.number(2, "price");
    fibber.format("price", { amount: 3 });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
