import { SchemaError } from "@fibber/schema";
import { describe, expect, it, vi } from "vitest";

import { defineCatalog } from "../src/catalog";
import { MalformedBundleError, MalformedListingError } from "../src/error";
import { toEntries } from "../src/util";
import { bundles, contract, entries, schema } from "./fixture";

/** A catalog over the fixture bundles, with overridable callbacks. */
const catalog = (provider: Partial<Parameters<typeof defineCatalog>[1]> = {}) =>
  defineCatalog(schema, {
    list: () => entries,
    get: (locale) => bundles[locale as "en"],
    ...provider,
  });

describe("list", () => {
  it("answers the entries the source serves", async () => {
    await expect(catalog().list()).resolves.toEqual(entries);
  });

  it("awaits a source that answers behind a promise", async () => {
    await expect(
      catalog({ list: async () => [entries[1]] }).list(),
    ).resolves.toEqual([entries[1]]);
  });

  it("tolerates fields beyond the model", async () => {
    const listing = [{ id: "fr", name: "Français", flag: "🇫🇷" }];
    await expect(catalog({ list: () => listing }).list()).resolves.toEqual(
      listing,
    );
  });

  it.each([
    ["not an array", { entries }],
    ["an entry outside the contract", [{ id: "de", name: "Deutsch" }]],
    ["an entry with no name", [{ id: "fr", name: "" }]],
    ["an entry that is not a record", ["fr"]],
  ])("rejects %s", async (_label, value) => {
    await expect(catalog({ list: () => value }).list()).rejects.toThrow(
      MalformedListingError,
    );
  });
});

describe("get", () => {
  it("answers a locale's bundle", async () => {
    await expect(catalog().get("fr")).resolves.toEqual(bundles.fr);
  });

  it.each([null, undefined])(
    "resolves undefined on a %s miss",
    async (miss) => {
      await expect(
        catalog({ get: () => miss }).get("fr"),
      ).resolves.toBeUndefined();
    },
  );

  it("rejects a locale outside the contract before asking the source", async () => {
    const get = vi.fn();
    await expect(catalog({ get }).get("de" as "fr")).rejects.toThrow(
      SchemaError,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects a payload that fails the contract, naming the locale", async () => {
    const error = await catalog({
      get: () => ({ title: "Bienvenue", retired: [] }),
    })
      .get("fr")
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MalformedBundleError);
    expect(error).toBeInstanceOf(SchemaError);
    expect((error as MalformedBundleError).locale).toBe("fr");
    expect((error as MalformedBundleError).issues).toHaveLength(2);
  });

  it("lets a source's own failure through untouched", async () => {
    const failure = new Error("storage offline");
    await expect(
      catalog({
        get: () => {
          throw failure;
        },
      }).get("fr"),
    ).rejects.toBe(failure);
  });
});

describe("toEntries", () => {
  it("names each locale of the contract in its own language", () => {
    expect(toEntries(contract)).toEqual(entries);
  });

  it("answers a listing a catalog accepts", async () => {
    await expect(
      catalog({ list: () => toEntries(contract) }).list(),
    ).resolves.toHaveLength(2);
  });
});
