import type { Translate } from "@fibber/translate";

import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KitConfig } from "../src/types";
import { InvalidMessagesError } from "../src/error";
import { generate } from "../src/generate";
import { resolveKit } from "../src/resolve";
import { translate } from "../src/translate";
import { discard } from "./helpers";

const CONFIG = {
  source: "messages",
  locale: "en",
  locales: ["fr"],
} satisfies KitConfig;

let root: string;

/** Writes a JSON document of the project, making its directory. */
const write = async (path: string, value: unknown) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), JSON.stringify(value));
};

/** A JSON document of the project, parsed. */
const read = async (path: string) =>
  JSON.parse(await readFile(join(root, path), "utf8")) as unknown;

/** Whether the project has a file at a path. */
const exists = (path: string) =>
  stat(join(root, path)).then(
    () => true,
    () => false,
  );

/** The issues of the InvalidMessagesError a promise must reject with. */
const issues = async (promise: Promise<unknown>): Promise<string[]> => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(InvalidMessagesError);
  return (error as InvalidMessagesError).issues;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "fibber-kit-"));
  await write("messages/page.json", {
    title: { defaultMessage: "Welcome" },
  });
  await write("messages/checkout/cart.json", {
    empty: { defaultMessage: "Your cart is empty" },
    items: {
      defaultMessage: "{count, plural, one {# item} other {# items}}",
      description: "How many items the cart holds.",
    },
  });
  await write("messages/notes.txt", "not a message document");
  await write("translations/fr/checkout/cart.json", {
    empty: "Votre panier est vide",
  });
});

afterEach(async () => {
  await discard(root);
});

describe("a source directory", () => {
  it("nests each file's keys under its path, files in path order", async () => {
    const kit = await resolveKit(CONFIG, { cwd: root });
    expect(Object.keys(kit.messages)).toEqual([
      "checkout.cart.empty",
      "checkout.cart.items",
      "page.title",
    ]);
    expect(kit.messages["checkout.cart.items"]).toEqual({
      arguments: { count: { kind: "number" } },
      source: "{count, plural, one {# item} other {# items}}",
      description: "How many items the cart holds.",
    });
  });

  it("reads each locale's translations from the mirrored file", async () => {
    const kit = await resolveKit(CONFIG, { cwd: root });
    expect(kit.bundles.fr?.["checkout.cart.empty"]).toEqual([
      { type: 0, value: "Votre panier est vide" },
    ]);
    expect(kit.coverage.fr?.missing).toEqual([
      "checkout.cart.items",
      "page.title",
    ]);
    expect(kit.inputs).toEqual([
      join(root, "messages/checkout/cart.json"),
      join(root, "messages/page.json"),
      join(root, "translations/fr/checkout/cart.json"),
    ]);
  });

  it("reports a translated key its file's source no longer has", async () => {
    await write("translations/fr/page.json", { title: "Bienvenue", old: "x" });
    const kit = await resolveKit(CONFIG, { cwd: root });
    expect(kit.coverage.fr?.orphaned).toEqual(["page.old"]);
  });

  it("emits the full keys to the contract", async () => {
    const output = await generate(CONFIG, { cwd: root });
    const declarations = output.files.find(
      (file) => file.path === "index.d.mts",
    );
    expect(declarations?.contents).toContain('"checkout.cart.items": {');
    expect(declarations?.contents).toContain('| "page.title"');
  });

  it("refuses a key that is both a message and a group", async () => {
    await write("messages/checkout.json", {
      cart: { defaultMessage: "Cart" },
    });
    expect(await issues(resolveKit(CONFIG, { cwd: root }))).toEqual([
      '"checkout.cart" (messages/checkout.json) is both a message and the group of "checkout.cart.empty" (messages/checkout/cart.json)',
      '"checkout.cart" (messages/checkout.json) is both a message and the group of "checkout.cart.items" (messages/checkout/cart.json)',
    ]);
  });

  it("refuses a key two files declare", async () => {
    await write("messages/checkout.json", {
      "cart.empty": { defaultMessage: "Empty" },
    });
    expect(await issues(resolveKit(CONFIG, { cwd: root }))).toEqual([
      '"checkout.cart.empty" is declared in both messages/checkout.json and messages/checkout/cart.json',
    ]);
  });

  it("refuses a key with an empty segment", async () => {
    await write("messages/page.json", {
      "title.": { defaultMessage: "Welcome" },
    });
    expect(await issues(resolveKit(CONFIG, { cwd: root }))).toEqual([
      '"page.title." (messages/page.json) has an empty segment — a dot separates the groups a message nests under',
    ]);
  });

  it("translates into the mirrored files, keeping what they hold", async () => {
    await writeFile(
      join(root, "fibber.config.ts"),
      `export default ${JSON.stringify({ ...CONFIG, translate: { model: "test/model" } })};\n`,
    );
    const translator = vi.fn<Translate>(async ({ target, messages }) =>
      Object.fromEntries(
        Object.entries(messages).map(([key, { message }]) => [
          key,
          `[${target}] ${message}`,
        ]),
      ),
    );
    const output = await translate({ root, translator });
    expect(output.fr?.written).toEqual(["checkout.cart.items", "page.title"]);
    expect(await read("translations/fr/checkout/cart.json")).toEqual({
      empty: "Votre panier est vide",
      items: "[fr] {count, plural, one {# item} other {# items}}",
    });
    expect(await read("translations/fr/page.json")).toEqual({
      title: "[fr] Welcome",
    });
    expect(await exists("translations/fr.json")).toBe(false);

    const again = await translate({ root, translator });
    expect(again.fr?.written).toEqual([]);
    expect(translator).toHaveBeenCalledTimes(1);
  });

  it("writes no file for a source file nothing was translated from", async () => {
    await writeFile(
      join(root, "fibber.config.ts"),
      `export default ${JSON.stringify({ ...CONFIG, translate: { model: "test/model" } })};\n`,
    );
    const translator = vi.fn<Translate>(async () => ({}));
    await translate({ root, translator });
    expect(await exists("translations/fr/page.json")).toBe(false);
  });
});

describe("a single source file", () => {
  it("nests a dotted key the same way, and refuses a conflict", async () => {
    await write("flat.json", {
      "a.b": { defaultMessage: "B" },
      a: { defaultMessage: "A" },
    });
    expect(
      await issues(
        resolveKit({ ...CONFIG, source: "flat.json" }, { cwd: root }),
      ),
    ).toEqual([
      '"a" (flat.json) is both a message and the group of "a.b" (flat.json)',
    ]);
  });
});
