import type { Translate } from "@fibber/translate";

import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { build } from "../src/build";
import { InvalidConfigError, InvalidMessagesError } from "../src/error";
import { translate } from "../src/translate";
import { CONFIG, discard, project } from "./helpers";

let root: string;

beforeEach(async () => {
  root = await project();
  await writeFile(
    join(root, "fibber.config.ts"),
    `export default ${JSON.stringify({ ...CONFIG, translate: { model: "test/model", instructions: "Be brief." } })};\n`,
  );
});

afterEach(async () => {
  await discard(root);
});

/** A JSON document of the project, parsed. */
const read = async (path: string) =>
  JSON.parse(await readFile(join(root, path), "utf8")) as Record<
    string,
    unknown
  >;

/** Rewrites one source message. */
const edit = async (key: string, defaultMessage: string) => {
  const source = await read("messages.json");
  source[key] = { defaultMessage };
  await writeFile(join(root, "messages.json"), JSON.stringify(source));
};

/** A translator that answers every message with its source, prefixed. */
const echo = () =>
  vi.fn<Translate>(async ({ target, messages }) =>
    Object.fromEntries(
      Object.entries(messages).map(([key, { message }]) => [
        key,
        `[${target}] ${message}`,
      ]),
    ),
  );

describe("translate", () => {
  it("translates only what a locale is missing", async () => {
    const translator = echo();
    const output = await translate({ root, translator });
    expect(output.fr).toEqual({
      written: ["invite", "total", "terms"],
      rejected: {},
      skipped: [],
      kept: [],
      pending: [],
      documents: { written: [], rejected: {}, pending: [] },
    });
    expect(translator).toHaveBeenCalledTimes(1);
    expect(translator).toHaveBeenCalledWith(
      {
        source: "en",
        target: "fr",
        messages: {
          invite: { message: expect.stringContaining("{gender, select") },
          total: { message: "{amount, number, price} due {due, date, long}" },
          terms: { message: "Read the <link>terms</link>" },
        },
      },
      { model: "test/model", instructions: "Be brief." },
    );
  });

  it("passes each message's description to the translator", async () => {
    const translator = echo();
    await writeFile(join(root, "translations/fr.json"), "{}");
    await translate({ root, translator });
    expect(translator.mock.calls[0]?.[0].messages.greeting).toEqual({
      message: "Hello, {name}!",
      description: "Greets the signed-in user by name.",
    });
  });

  it("writes the locale file in source order, leaving the rest as it was", async () => {
    await translate({ root, translator: echo() });
    const fr = await read("translations/fr.json");
    expect(Object.keys(fr)).toEqual([
      "greeting",
      "title",
      "inbox",
      "invite",
      "total",
      "terms",
      "retired",
    ]);
    expect(fr.greeting).toBe("Bonjour, {name} !");
    expect(fr.terms).toBe("[fr] Read the <link>terms</link>");
    expect(fr.retired).toBe("Ancien message");
  });

  it("writes what the build then accepts", async () => {
    await translate({ root, translator: echo() });
    const output = await build({ root });
    expect(output.coverage.fr?.missing).toEqual([]);
  });

  it("does nothing on a second run", async () => {
    await translate({ root, translator: echo() });
    const before = await readFile(join(root, "translations/fr.json"), "utf8");
    const translator = echo();
    const output = await translate({ root, translator });
    expect(translator).not.toHaveBeenCalled();
    expect(output.fr?.written).toEqual([]);
    expect(await readFile(join(root, "translations/fr.json"), "utf8")).toBe(
      before,
    );
  });

  it("translates again when a source message changes", async () => {
    await translate({ root, translator: echo() });
    await edit("terms", "Read our <link>terms</link>");
    const output = await translate({ root, translator: echo() });
    expect(output.fr?.written).toEqual(["terms"]);
    expect((await read("translations/fr.json")).terms).toBe(
      "[fr] Read our <link>terms</link>",
    );
  });

  it("never translates over a translation written by hand", async () => {
    const translator = echo();
    await translate({ root, translator });
    // `title` was in the fixture before any run: someone's own.
    await edit("title", "Welcome back");
    translator.mockClear();
    const output = await translate({ root, translator });
    expect(translator).not.toHaveBeenCalled();
    expect(output.fr).toMatchObject({ written: [], kept: ["title"] });
    expect((await read("translations/fr.json")).title).toBe("Bienvenue");
    expect((await translate({ root, translator })).fr?.kept).toEqual([]);
  });

  it("keeps a translation edited by hand after it was translated, and says so once", async () => {
    await translate({ root, translator: echo() });
    const fr = await read("translations/fr.json");
    fr.terms = "Lisez les <link>conditions</link>";
    await writeFile(join(root, "translations/fr.json"), JSON.stringify(fr));
    await edit("terms", "Read our <link>terms</link>");

    const translator = echo();
    const first = await translate({ root, translator });
    expect(first.fr).toMatchObject({ written: [], kept: ["terms"] });
    expect(translator).not.toHaveBeenCalled();
    expect((await read("translations/fr.json")).terms).toBe(
      "Lisez les <link>conditions</link>",
    );

    const second = await translate({ root, translator });
    expect(second.fr?.kept).toEqual([]);
  });

  it("translates again a key whose translation was deleted", async () => {
    await translate({ root, translator: echo() });
    const fr = await read("translations/fr.json");
    delete fr.greeting;
    await writeFile(join(root, "translations/fr.json"), JSON.stringify(fr));
    const output = await translate({ root, translator: echo() });
    expect(output.fr?.written).toEqual(["greeting"]);
  });

  it("rejects a translation that does not hold, and writes the rest", async () => {
    const translator = vi.fn<Translate>(async () => ({
      invite: "Invitation de {who}",
      total: "{amount, number, prix}",
      terms: "Lisez les <link>conditions",
    }));
    const output = await translate({ root, translator });
    expect(output.fr?.written).toEqual([]);
    expect(output.fr?.rejected).toEqual({
      invite: ['takes "who", which the source message does not'],
      total: [expect.stringContaining('uses the number format "prix"')],
      terms: [expect.stringContaining("is not valid ICU MessageFormat")],
    });
    const fr = await read("translations/fr.json");
    expect(fr.invite).toBeUndefined();
    const again = echo();
    await translate({ root, translator: again });
    expect(Object.keys(again.mock.calls[0]?.[0].messages ?? {})).toEqual([
      "invite",
      "total",
      "terms",
    ]);
  });

  it("reports a key the translator did not answer", async () => {
    const translator = vi.fn<Translate>(async () => ({
      terms: "Lisez les <link>conditions</link>",
    }));
    const output = await translate({ root, translator });
    expect(output.fr).toMatchObject({
      written: ["terms"],
      skipped: ["invite", "total"],
    });
  });

  it("records each translation in the lock, and only those that exist", async () => {
    await translate({ root, translator: echo() });
    const lock = await read("translations/.fibber.lock.json");
    expect(Object.keys(lock)).toEqual(["fr"]);
    const fr = lock.fr as Record<string, Record<string, unknown>>;
    expect(Object.keys(fr.messages ?? {})).toEqual([
      "greeting",
      "title",
      "inbox",
      "invite",
      "total",
      "terms",
    ]);
    expect(fr.messages?.terms).toEqual({
      source: expect.stringMatching(/^[0-9a-f]{16}$/),
      translation: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(fr.messages?.title).toMatchObject({
      manual: true,
    });
  });

  it("creates a locale that has no file yet, and can be limited to it", async () => {
    await writeFile(
      join(root, "fibber.config.ts"),
      `export default ${JSON.stringify({ ...CONFIG, locales: ["fr", "de"], translate: { model: "test/model" } })};\n`,
    );
    const translator = echo();
    const output = await translate({ root, translator, locales: ["de"] });
    expect(Object.keys(output)).toEqual(["de"]);
    expect(output.de?.written).toHaveLength(6);
    expect((await read("translations/de.json")).title).toBe("[de] Welcome");
    expect(translator).toHaveBeenCalledTimes(1);
  });

  it("keeps what finished when a later locale fails", async () => {
    await writeFile(
      join(root, "fibber.config.ts"),
      `export default ${JSON.stringify({ ...CONFIG, locales: ["fr", "de"], translate: { model: "test/model" } })};\n`,
    );
    const failure = new Error("rate limited");
    const translator = vi.fn<Translate>(async (request) => {
      if (request.target === "de") {
        throw failure;
      }
      return { terms: "Lisez les <link>conditions</link>" };
    });
    await expect(translate({ root, translator })).rejects.toBe(failure);
    expect((await read("translations/fr.json")).terms).toBe(
      "Lisez les <link>conditions</link>",
    );
  });

  it("checks what a run would translate without calling or writing anything", async () => {
    const translator = echo();
    const before = await readFile(join(root, "translations/fr.json"), "utf8");
    const output = await translate({ root, translator, check: true });
    expect(output.fr).toMatchObject({
      pending: ["invite", "total", "terms"],
      written: [],
    });
    expect(translator).not.toHaveBeenCalled();
    expect(await readFile(join(root, "translations/fr.json"), "utf8")).toBe(
      before,
    );
    await expect(read("translations/.fibber.lock.json")).rejects.toThrow();
  });

  it("checks clean after a run, and flags a source that then changes", async () => {
    await translate({ root, translator: echo() });
    expect((await translate({ root, check: true })).fr?.pending).toEqual([]);
    await edit("terms", "Read our <link>terms</link>");
    await edit("title", "Welcome back");
    const output = await translate({ root, check: true });
    expect(output.fr).toMatchObject({ pending: ["terms"], kept: ["title"] });
    // A check records nothing, so it says the same thing again.
    expect((await translate({ root, check: true })).fr).toMatchObject({
      pending: ["terms"],
      kept: ["title"],
    });
  });

  it("checks without a model in the config", async () => {
    await writeFile(
      join(root, "fibber.config.ts"),
      `export default ${JSON.stringify(CONFIG)};\n`,
    );
    const output = await translate({ root, check: true });
    expect(output.fr?.pending).toHaveLength(3);
  });

  it("requires a model to translate, and none to build", async () => {
    await writeFile(
      join(root, "fibber.config.ts"),
      `export default ${JSON.stringify(CONFIG)};\n`,
    );
    await expect(translate({ root, translator: echo() })).rejects.toThrow(
      /translate\.model is required/,
    );
    await expect(build({ root })).resolves.toBeDefined();
  });

  it("translates by the options a run is given, over the config's", async () => {
    const translator = echo();
    await translate({
      root,
      translator,
      translate: { model: "other/model" },
    });
    expect(translator.mock.calls[0]?.[1]).toEqual({ model: "other/model" });
    await expect(
      translate({ root, translator, translate: {} as never }),
    ).rejects.toThrow("translate.model is required");
  });

  it("leaves every file untouched on a run with nothing to translate", async () => {
    await translate({ root, translator: echo() });
    const before = await Promise.all(
      ["translations/fr.json", "translations/.fibber.lock.json"].map(
        async (path) => (await stat(join(root, path))).mtimeMs,
      ),
    );
    await new Promise((done) => setTimeout(done, 20));
    await translate({ root, translator: echo() });
    const after = await Promise.all(
      ["translations/fr.json", "translations/.fibber.lock.json"].map(
        async (path) => (await stat(join(root, path))).mtimeMs,
      ),
    );
    expect(after).toEqual(before);
  });

  it("rejects a locale the config does not translate to", async () => {
    await expect(
      translate({ root, translator: echo(), locales: ["de"] }),
    ).rejects.toThrow(InvalidConfigError);
  });

  it("refuses to translate from a source that does not compile", async () => {
    await edit("title", "Welcome {name");
    const translator = echo();
    await expect(translate({ root, translator })).rejects.toThrow(
      InvalidMessagesError,
    );
    expect(translator).not.toHaveBeenCalled();
  });
});
