import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { build } from "../src/build";
import { defineConfig } from "../src/config";
import {
  InvalidConfigError,
  MalformedConfigError,
  MissingConfigError,
} from "../src/error";
import { loadConfig } from "../src/load";
import { writeOutput } from "../src/write";
import { CONFIG, discard, project } from "./helpers";

let root: string;

beforeEach(async () => {
  root = await project();
});

afterEach(async () => {
  await discard(root);
});

const config = async (body: string, name = "fibber.config.ts") => {
  await writeFile(join(root, name), body);
};

describe("defineConfig", () => {
  it("returns the config it is given", () => {
    expect(defineConfig(CONFIG)).toBe(CONFIG);
  });
});

describe("loadConfig", () => {
  it("loads the default export of a TypeScript config", async () => {
    await config(
      'const locale: string = "en";\nexport default { source: "messages.json", locale };\n',
    );
    await expect(loadConfig(join(root, "fibber.config.ts"))).resolves.toEqual({
      source: "messages.json",
      locale: "en",
    });
  });

  it("throws when there is no file", async () => {
    await expect(loadConfig(join(root, "fibber.config.ts"))).rejects.toThrow(
      MissingConfigError,
    );
  });

  it("throws when the default export is not a config", async () => {
    await config('export default { source: "messages.json" };\n');
    await expect(loadConfig(join(root, "fibber.config.ts"))).rejects.toThrow(
      MalformedConfigError,
    );
  });
});

describe("build", () => {
  it("writes the module, the bundles and a manifest under the output directory", async () => {
    await config(`export default ${JSON.stringify(CONFIG)};\n`);
    const output = await build({ root });
    expect(output.outDir).toBe("fibber");
    const written = (
      await readdir(join(root, "fibber"), { recursive: true })
    ).sort();
    expect(written).toEqual([
      ".fibber.json",
      "bundles.d.mts",
      "bundles.mjs",
      "index.d.mts",
      "index.mjs",
      "locales",
      "locales/en.mjs",
      "locales/fr.mjs",
    ]);
    const manifest = JSON.parse(
      await readFile(join(root, "fibber", ".fibber.json"), "utf8"),
    );
    expect(manifest.files).toEqual(output.files.map((file) => file.path));
  });

  it("builds the config it is pointed at", async () => {
    await config(
      `export default ${JSON.stringify({ ...CONFIG, locales: [], outDir: "src/lang" })};\n`,
      "lang.config.ts",
    );
    await build({ root, config: "lang.config.ts" });
    const bundle = await readFile(
      join(root, "src/lang/locales/en.mjs"),
      "utf8",
    );
    expect(bundle).toContain('"title":[{"type":0,"value":"Welcome"}]');
  });

  it("removes the bundle of a locale the config no longer lists", async () => {
    await config(`export default ${JSON.stringify(CONFIG)};\n`);
    await build({ root });
    await config(
      `export default ${JSON.stringify({ ...CONFIG, locales: [] })};\n`,
    );
    await build({ root });
    expect(await readdir(join(root, "fibber/locales"))).toEqual(["en.mjs"]);
  });

  it("rejects an invalid config", async () => {
    await config(
      'export default { source: "messages.json", locale: "en", outDir: "/abs" };\n',
    );
    await expect(build({ root })).rejects.toThrow(InvalidConfigError);
  });
});

describe("writeOutput", () => {
  const output = (files: Record<string, string>) => ({
    outDir: "out",
    coverage: {},
    files: Object.entries(files).map(([path, contents]) => ({
      path,
      contents,
    })),
  });

  it("removes files the previous write produced and this one does not", async () => {
    await writeOutput(output({ "a.mjs": "a", "b.mjs": "b" }), root);
    await writeFile(join(root, "out", "authored.ts"), "mine");
    await writeOutput(output({ "a.mjs": "a2" }), root);
    const written = (await readdir(join(root, "out"))).sort();
    expect(written).toEqual([".fibber.json", "a.mjs", "authored.ts"]);
    expect(await readFile(join(root, "out", "a.mjs"), "utf8")).toBe("a2");
  });

  it("leaves alone a manifest entry that reaches outside the directory", async () => {
    await writeFile(join(root, "keep.txt"), "keep");
    await writeOutput(output({}), root);
    await writeFile(
      join(root, "out", ".fibber.json"),
      JSON.stringify({ files: ["../keep.txt", 7] }),
    );
    await writeOutput(output({}), root);
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep");
  });

  it("treats an unreadable manifest as empty", async () => {
    await writeOutput(output({}), root);
    await writeFile(join(root, "out", ".fibber.json"), "{not json");
    await expect(writeOutput(output({}), root)).resolves.toBeUndefined();
  });
});
