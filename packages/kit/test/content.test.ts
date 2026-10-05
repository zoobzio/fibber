import type { TranslateDocument } from "@fibber/translate";

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { build } from "../src/build";
import { checkDocument, listDocuments } from "../src/documents";
import { translate } from "../src/translate";
import { CONFIG, discard, project } from "./helpers";

const INTRO = `---
title: Getting started
order: 1
---

# Getting started

Install the package:

\`\`\`sh
pnpm add fibber
\`\`\`
`;

const FAQ = "# Questions\n\nAsk away.\n";

let root: string;

/** Writes a file of the project, creating its directories. */
const write = async (path: string, contents: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
};

const read = (path: string) => readFile(join(root, path), "utf8");

beforeEach(async () => {
  root = await project();
  await write(
    "fibber.config.ts",
    `export default ${JSON.stringify({ ...CONFIG, content: "content", translate: { model: "test/model" } })};\n`,
  );
  await write("content/guide/intro.md", INTRO);
  await write("content/faq.md", FAQ);
  await write("content/notes.txt", "not a document");
});

afterEach(async () => {
  await discard(root);
});

/** A message translator with nothing to say: these tests are about documents. */
const translator = async () => ({});

/** A document translator that marks prose lines, leaving structure alone. */
const mark = () =>
  vi.fn<TranslateDocument>(async ({ target, document }) =>
    document
      .replace("Install the package:", `[${target}] Install the package:`)
      .replace("Ask away.", `[${target}] Ask away.`),
  );

describe("listDocuments", () => {
  it("lists the Markdown files at any depth, sorted, as posix paths", async () => {
    await expect(listDocuments(join(root, "content"))).resolves.toEqual([
      "faq.md",
      "guide/intro.md",
    ]);
  });

  it("lists nothing for a directory that does not exist", async () => {
    await expect(listDocuments(join(root, "nope"))).resolves.toEqual([]);
  });
});

describe("checkDocument", () => {
  it("accepts a translation that keeps the structure", () => {
    expect(
      checkDocument(INTRO, INTRO.replaceAll("Getting started", "Démarrer")),
    ).toEqual([]);
  });

  it("rejects an empty translation", () => {
    expect(checkDocument(INTRO, " \n")).toEqual(["is empty"]);
  });

  it("rejects front matter that lost, gained or dropped keys", () => {
    expect(checkDocument(INTRO, INTRO.replace("order: 1", "ordre: 1"))).toEqual(
      ["lost the front matter keys order", "added the front matter keys ordre"],
    );
    expect(
      checkDocument(INTRO, INTRO.replace(/^---[\s\S]*?---\n\n/, "")),
    ).toEqual(["lost the source's front matter"]);
    expect(checkDocument(FAQ, `---\ntitle: FAQ\n---\n\n${FAQ}`)).toEqual([
      "has front matter, which the source does not",
    ]);
  });

  it("rejects a code block that changed, went missing or appeared", () => {
    expect(
      checkDocument(INTRO, INTRO.replace("pnpm add", "pnpm ajouter")),
    ).toEqual(["changed fenced code block 1"]);
    expect(checkDocument(INTRO, INTRO.replace("```sh", "```bash"))).toEqual([
      "changed fenced code block 1",
    ]);
    expect(
      checkDocument(INTRO, INTRO.replace(/```sh[\s\S]*```\n/, "")),
    ).toEqual(["has 0 fenced code blocks where the source has 1"]);
    expect(checkDocument(FAQ, `\`\`\`markdown\n${FAQ}\`\`\`\n`)).toEqual([
      "has 1 fenced code blocks where the source has 0",
    ]);
  });
});

describe("translate, with content", () => {
  it("translates each document a locale lacks, to translations/<locale>/", async () => {
    const documentTranslator = mark();
    const output = await translate({ root, translator, documentTranslator });
    expect(output.fr?.documents).toEqual({
      written: ["faq.md", "guide/intro.md"],
      rejected: {},
      pending: [],
    });
    expect(documentTranslator).toHaveBeenCalledWith(
      {
        source: "en",
        target: "fr",
        path: "guide/intro.md",
        document: INTRO,
      },
      { model: "test/model" },
    );
    expect(await read("translations/fr/guide/intro.md")).toContain(
      "[fr] Install the package:",
    );
    expect(await read("translations/fr/faq.md")).toBe(
      "# Questions\n\n[fr] Ask away.\n",
    );
  });

  it("does nothing on a second run", async () => {
    await translate({ root, translator, documentTranslator: mark() });
    const documentTranslator = mark();
    const output = await translate({ root, translator, documentTranslator });
    expect(documentTranslator).not.toHaveBeenCalled();
    expect(output.fr?.documents.written).toEqual([]);
  });

  it("brings a translation up to date when its source changes, from what it has", async () => {
    await translate({ root, translator, documentTranslator: mark() });
    // Someone polishes the translation, then the source gains a line.
    await write("translations/fr/faq.md", "# Questions\n\nDemandez.\n");
    await write("content/faq.md", `${FAQ}\nWe answer.\n`);

    const documentTranslator = vi.fn<TranslateDocument>(
      async ({ previous }) => `${previous}\nNous répondons.\n`,
    );
    const output = await translate({ root, translator, documentTranslator });
    expect(output.fr?.documents.written).toEqual(["faq.md"]);
    expect(documentTranslator).toHaveBeenCalledTimes(1);
    expect(documentTranslator.mock.calls[0]?.[0]).toEqual({
      source: "en",
      target: "fr",
      path: "faq.md",
      document: `${FAQ}\nWe answer.\n`,
      previous: "# Questions\n\nDemandez.\n",
    });
    expect(await read("translations/fr/faq.md")).toBe(
      "# Questions\n\nDemandez.\n\nNous répondons.\n",
    );
  });

  it("leaves a hand-edited translation alone while its source is unchanged", async () => {
    await translate({ root, translator, documentTranslator: mark() });
    await write("translations/fr/faq.md", "# Questions\n\nDemandez.\n");
    const documentTranslator = mark();
    await translate({ root, translator, documentTranslator });
    expect(documentTranslator).not.toHaveBeenCalled();
    expect(await read("translations/fr/faq.md")).toBe(
      "# Questions\n\nDemandez.\n",
    );
  });

  it("adopts a translation someone wrote before any run", async () => {
    await write("translations/fr/faq.md", "# Questions\n\nÀ vous.\n");
    const documentTranslator = mark();
    const output = await translate({ root, translator, documentTranslator });
    expect(output.fr?.documents.written).toEqual(["guide/intro.md"]);
    expect(await read("translations/fr/faq.md")).toBe(
      "# Questions\n\nÀ vous.\n",
    );
  });

  it("rejects a document whose structure did not survive, and asks again", async () => {
    const broken = vi.fn<TranslateDocument>(async ({ document }) =>
      document.replace("pnpm add", "pnpm ajouter"),
    );
    const output = await translate({
      root,
      translator,
      documentTranslator: broken,
    });
    expect(output.fr?.documents).toEqual({
      written: ["faq.md"],
      rejected: { "guide/intro.md": ["changed fenced code block 1"] },
      pending: [],
    });
    await expect(read("translations/fr/guide/intro.md")).rejects.toThrow();

    const again = mark();
    await translate({ root, translator, documentTranslator: again });
    expect(again.mock.calls.map(([request]) => request.path)).toEqual([
      "guide/intro.md",
    ]);
  });

  it("checks which documents a run would translate or update, writing nothing", async () => {
    const documentTranslator = mark();
    const first = await translate({ root, documentTranslator, check: true });
    expect(first.fr?.documents.pending).toEqual(["faq.md", "guide/intro.md"]);
    expect(documentTranslator).not.toHaveBeenCalled();
    await expect(read("translations/fr/faq.md")).rejects.toThrow();

    await translate({ root, translator, documentTranslator });
    expect(
      (await translate({ root, check: true })).fr?.documents.pending,
    ).toEqual([]);

    await write("content/faq.md", `${FAQ}\nWe answer.\n`);
    expect(
      (await translate({ root, check: true })).fr?.documents.pending,
    ).toEqual(["faq.md"]);
  });

  it("records documents in the lock apart from messages, and forgets removed ones", async () => {
    await translate({ root, translator, documentTranslator: mark() });
    const lock = JSON.parse(await read("translations/.fibber.lock.json"));
    expect(Object.keys(lock.fr.documents)).toEqual([
      "faq.md",
      "guide/intro.md",
    ]);
    expect(lock.fr.messages).not.toHaveProperty("faq.md");

    await rm(join(root, "content/faq.md"));
    await translate({ root, translator, documentTranslator: mark() });
    const after = JSON.parse(await read("translations/.fibber.lock.json"));
    expect(Object.keys(after.fr.documents)).toEqual(["guide/intro.md"]);
  });
});

describe("build, with content", () => {
  it("emits every document for every locale, the source filling the gaps", async () => {
    await write("translations/fr/faq.md", "# Questions\n\nDemandez.\n");
    const output = await build({ root });
    expect(output.coverage.fr?.documents).toEqual(["guide/intro.md"]);
    const written = (
      await readdir(join(root, "fibber/content"), { recursive: true })
    ).sort();
    expect(written).toEqual([
      "en",
      "en/faq.md",
      "en/guide",
      "en/guide/intro.md",
      "fr",
      "fr/faq.md",
      "fr/guide",
      "fr/guide/intro.md",
    ]);
    expect(await read("fibber/content/fr/faq.md")).toBe(
      "# Questions\n\nDemandez.\n",
    );
    expect(await read("fibber/content/fr/guide/intro.md")).toBe(INTRO);
    expect(await read("fibber/content/en/faq.md")).toBe(FAQ);
  });

  it("lists the documents in the contract module, typed", async () => {
    await build({ root });
    expect(await read("fibber/index.mjs")).toContain('"guide/intro.md"');
    expect(await read("fibber/index.d.mts")).toContain(
      'export type Document =\n  | "faq.md"\n  | "guide/intro.md";',
    );
  });

  it("builds no content when the config names no directory", async () => {
    await write(
      "fibber.config.ts",
      `export default ${JSON.stringify(CONFIG)};\n`,
    );
    const output = await build({ root });
    expect(output.files.some((file) => file.path.startsWith("content/"))).toBe(
      false,
    );
    expect(await read("fibber/index.d.mts")).toContain(
      "export type Document = never;",
    );
  });

  it("removes the built copy of a document that was deleted", async () => {
    await build({ root });
    await rm(join(root, "content/faq.md"));
    await build({ root });
    await expect(read("fibber/content/en/faq.md")).rejects.toThrow();
    expect(await read("fibber/content/en/guide/intro.md")).toBe(INTRO);
  });
});
