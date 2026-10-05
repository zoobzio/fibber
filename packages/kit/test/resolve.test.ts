import { IntlMessageFormat } from "intl-messageformat";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InvalidConfigError,
  InvalidDocumentError,
  InvalidMessagesError,
} from "../src/error";
import { resolveKit } from "../src/resolve";
import { CONFIG, discard, project } from "./helpers";

let root: string;

beforeEach(async () => {
  root = await project();
});

afterEach(async () => {
  await discard(root);
});

/** The issues of the InvalidMessagesError a promise must reject with. */
const issues = async (promise: Promise<unknown>): Promise<string[]> => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(InvalidMessagesError);
  return (error as InvalidMessagesError).issues;
};

describe("resolveKit", () => {
  it("reads the contract off the source messages, in source order", async () => {
    const kit = await resolveKit(CONFIG, { cwd: root });
    expect(kit.locale).toBe("en");
    expect(kit.locales).toEqual(["en", "fr"]);
    expect(Object.keys(kit.messages)).toEqual([
      "greeting",
      "title",
      "inbox",
      "invite",
      "total",
      "terms",
    ]);
    expect(kit.messages.greeting).toEqual({
      arguments: { name: { kind: "value" } },
      source: "Hello, {name}!",
      description: "Greets the signed-in user by name.",
    });
    expect(kit.messages.title).toEqual({ arguments: {}, source: "Welcome" });
    expect(kit.messages.invite?.arguments).toEqual({
      gender: { kind: "select", options: ["female", "male", "other"] },
      at: { kind: "date" },
    });
  });

  it("builds a complete bundle per locale, the source filling the gaps", async () => {
    const kit = await resolveKit(CONFIG, { cwd: root });
    const keys = Object.keys(kit.messages);
    expect(Object.keys(kit.bundles.en ?? {})).toEqual(keys);
    expect(Object.keys(kit.bundles.fr ?? {})).toEqual(keys);
    expect(kit.bundles.fr?.invite).toBe(kit.bundles.en?.invite);
    expect(kit.coverage).toEqual({
      fr: {
        missing: ["invite", "total", "terms"],
        orphaned: ["retired"],
        documents: [],
      },
    });
  });

  it("emits ASTs the FormatJS runtime formats without a parser", async () => {
    const kit = await resolveKit(CONFIG, { cwd: root });
    const format = (locale: string, key: string, values?: object) =>
      new IntlMessageFormat(kit.bundles[locale]?.[key] ?? [], locale).format(
        values as never,
      );
    expect(format("en", "inbox", { count: 1 })).toBe("1 new message");
    expect(format("fr", "inbox", { count: 3 })).toBe("3 nouveaux messages");
    expect(
      format("en", "invite", { gender: "female", at: new Date(2026, 0, 5) }),
    ).toBe("She invited you on Jan 5, 2026");
    expect(
      format("en", "terms", { link: (chunks: string[]) => `[${chunks}]` }),
    ).toBe("Read the [terms]");
  });

  it("builds a target locale that has no translations file yet", async () => {
    const kit = await resolveKit(
      { ...CONFIG, locales: ["fr", "de"] },
      { cwd: root },
    );
    expect(kit.bundles.de).toEqual(kit.bundles.en);
    expect(kit.coverage.de).toEqual({
      missing: Object.keys(kit.messages),
      orphaned: [],
      documents: [],
    });
  });

  it("lists the files it read, the source first", async () => {
    const kit = await resolveKit(
      { ...CONFIG, locales: ["fr", "de"] },
      { cwd: root },
    );
    expect(kit.inputs).toEqual([
      join(root, "messages.json"),
      join(root, "translations/fr.json"),
    ]);
  });

  it("reads translations from the configured directory", async () => {
    await mkdir(join(root, "lang"));
    await writeFile(join(root, "lang/de.json"), '{ "title": "Willkommen" }');
    const kit = await resolveKit(
      { ...CONFIG, locales: ["de"], translations: "lang", outDir: "src/lang" },
      { cwd: root },
    );
    expect(kit.outDir).toBe("src/lang");
    expect(kit.coverage.de?.missing).not.toContain("title");
  });

  it("reports every invalid message across every locale at once", async () => {
    await writeFile(
      join(root, "messages.json"),
      JSON.stringify({
        ok: { defaultMessage: "{n, plural, one {#} other {#}}" },
        broken: { defaultMessage: "Hello {name" },
        torn: { defaultMessage: "{at, date} {at, number}" },
      }),
    );
    await writeFile(
      join(root, "translations/fr.json"),
      JSON.stringify({ ok: "{n} {who}", broken: "Bonjour" }),
    );
    expect(await issues(resolveKit(CONFIG, { cwd: root }))).toEqual([
      'en: "broken" is not valid ICU MessageFormat (EXPECT_ARGUMENT_CLOSING_BRACE at 1:7)',
      'en: "torn" argument "at" is used as both date and number',
      'fr: "ok" takes "who", which the source message does not',
    ]);
  });

  it("formats a declared named format through the emitted contract", async () => {
    const kit = await resolveKit(CONFIG, { cwd: root });
    expect(kit.formats).toEqual({
      number: { price: { style: "currency", currency: "EUR" } },
      date: {},
      time: {},
    });
    const formatted = new IntlMessageFormat(
      kit.bundles.en?.total ?? [],
      "en",
      // FormatJS types its options more narrowly than the platform's.
      kit.formats as never,
    ).format({ amount: 5, due: new Date(2026, 0, 5) });
    expect(formatted).toBe("€5.00 due January 5, 2026");
  });

  it("rejects a named format that is neither built in nor declared", async () => {
    await writeFile(
      join(root, "translations/fr.json"),
      JSON.stringify({ total: "{amount, number, prix} {due, date, long}" }),
    );
    expect(
      await issues(
        resolveKit({ ...CONFIG, formats: undefined }, { cwd: root }),
      ),
    ).toEqual([
      'en: "total" uses the number format "price", which is neither built in nor declared in the config\'s formats',
      'fr: "total" uses the number format "prix", which is neither built in nor declared in the config\'s formats',
    ]);
  });

  it("rejects the built-in currency format unless it is declared", async () => {
    await writeFile(
      join(root, "messages.json"),
      JSON.stringify({ cost: { defaultMessage: "{n, number, currency}" } }),
    );
    await writeFile(join(root, "translations/fr.json"), "{}");
    await expect(resolveKit(CONFIG, { cwd: root })).rejects.toThrow(
      /uses the number format "currency"/,
    );
    const kit = await resolveKit(
      {
        ...CONFIG,
        formats: {
          number: { currency: { style: "currency", currency: "USD" } },
        },
      },
      { cwd: root },
    );
    expect(Object.keys(kit.messages)).toEqual(["cost"]);
  });

  it("rejects formats the runtime could not construct", async () => {
    const error = await resolveKit(
      {
        ...CONFIG,
        formats: {
          number: { broken: { style: "currency" } },
          date: { odd: "long" },
          colour: {},
        } as never,
      },
      { cwd: root },
    ).catch((reason: unknown) => reason);
    expect((error as InvalidConfigError).issues).toEqual([
      expect.stringMatching(/^formats\.number\.broken is not valid \(/),
      "formats.date.odd must be an object of Intl options",
      "formats.colour is not a kind of format (number, date, time)",
    ]);
  });

  it("reports a translation that does not parse", async () => {
    await writeFile(
      join(root, "translations/fr.json"),
      JSON.stringify({ title: "<b>Bienvenue" }),
    );
    expect(await issues(resolveKit(CONFIG, { cwd: root }))).toEqual([
      expect.stringMatching(/^fr: "title" is not valid ICU MessageFormat/),
    ]);
  });

  it("rejects a missing or malformed source document", async () => {
    await expect(
      resolveKit({ ...CONFIG, source: "nope.json" }, { cwd: root }),
    ).rejects.toThrow(InvalidDocumentError);
    await writeFile(join(root, "messages.json"), "{not json");
    await expect(resolveKit(CONFIG, { cwd: root })).rejects.toThrow(
      /is not valid JSON/,
    );
    await writeFile(join(root, "messages.json"), '{ "title": "Welcome" }');
    await expect(resolveKit(CONFIG, { cwd: root })).rejects.toThrow(
      /must map "title" to a descriptor/,
    );
  });

  it("rejects a translations document that is not a flat map of strings", async () => {
    await writeFile(
      join(root, "translations/fr.json"),
      '{ "title": { "defaultMessage": "Bienvenue" } }',
    );
    await expect(resolveKit(CONFIG, { cwd: root })).rejects.toThrow(
      /must map "title" to a message string/,
    );
  });

  it("rejects an invalid config before reading anything", async () => {
    await rm(join(root, "messages.json"));
    const error = await resolveKit(
      {
        source: "messages.json",
        locale: "EN-us",
        locales: ["fr", "fr", "en", "not a locale"],
        translations: "../elsewhere",
        outDir: "/abs",
      },
      { cwd: root },
    ).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(InvalidConfigError);
    expect((error as InvalidConfigError).issues).toEqual([
      'locale "EN-us" must be written canonically, as "en-US"',
      'locales[1] "fr" is listed twice',
      'locales[3] "not a locale" is not a BCP 47 locale tag',
      "translations must be a directory inside the project root",
      "outDir must be a directory inside the project root",
    ]);
  });

  it("rejects the source locale listed as a target", async () => {
    await expect(
      resolveKit({ ...CONFIG, locales: ["en"] }, { cwd: root }),
    ).rejects.toThrow(/is the source locale/);
  });
});
