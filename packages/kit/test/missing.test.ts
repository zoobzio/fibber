import type { Translate, TranslateDocument } from "@fibber/translate";

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { build } from "../src/build";
import { MissingTranslatorError } from "../src/error";
import { translate } from "../src/translate";
import { CONFIG, discard, project } from "./helpers";

/* A project without `@fibber/translate` installed: importing it fails. */
vi.mock("@fibber/translate", () => {
  throw new Error("Cannot find package '@fibber/translate'");
});

let root: string;

beforeEach(async () => {
  root = await project();
  await writeFile(
    join(root, "fibber.config.ts"),
    `export default ${JSON.stringify({ ...CONFIG, translate: { model: "test/model" } })};\n`,
  );
});

afterEach(async () => {
  await discard(root);
});

describe("the kit without @fibber/translate", () => {
  it("builds", async () => {
    const output = await build({ root });
    expect(output.files.length).toBeGreaterThan(0);
  });

  it("checks what a run would translate", async () => {
    const output = await translate({ root, check: true });
    expect(output.fr?.pending).toEqual(["invite", "total", "terms"]);
  });

  it("translates through translators it is given", async () => {
    const translator = vi.fn<Translate>(async () => ({}));
    const documentTranslator = vi.fn<TranslateDocument>(async () => "");
    await translate({ root, translator, documentTranslator });
    expect(translator).toHaveBeenCalled();
  });

  it("says the package is needed to translate, before anything is written", async () => {
    await expect(translate({ root })).rejects.toBeInstanceOf(
      MissingTranslatorError,
    );
    await expect(translate({ root })).rejects.toThrow(
      "add it to your devDependencies",
    );
  });
});
