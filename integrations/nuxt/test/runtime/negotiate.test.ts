import { describe, expect, it } from "vitest";

import { negotiate } from "../../src/runtime/negotiate";

const LOCALES = ["en", "fr", "pt-BR"] as const;

describe("negotiate", () => {
  it("answers nothing without a header", () => {
    expect(negotiate(undefined, LOCALES)).toBeUndefined();
    expect(negotiate("", LOCALES)).toBeUndefined();
  });

  it("matches a locale exactly, whatever its case", () => {
    expect(negotiate("fr", LOCALES)).toBe("fr");
    expect(negotiate("PT-br", LOCALES)).toBe("pt-BR");
  });

  it("serves a regional request the locale of its language", () => {
    expect(negotiate("fr-CA", LOCALES)).toBe("fr");
    expect(negotiate("pt-PT", LOCALES)).toBe("pt-BR");
    expect(negotiate("pt", LOCALES)).toBe("pt-BR");
  });

  it("follows the visitor's ranking, not the header's order", () => {
    expect(negotiate("en;q=0.5, fr;q=0.9", LOCALES)).toBe("fr");
    expect(negotiate("de, fr;q=0.8, en;q=0.9", LOCALES)).toBe("en");
  });

  it("tries a language before a lower-ranked exact match", () => {
    expect(negotiate("fr-CH, en;q=0.9", LOCALES)).toBe("fr");
  });

  it("skips wildcards and languages the visitor refuses", () => {
    expect(negotiate("*, fr;q=0", LOCALES)).toBeUndefined();
    expect(negotiate("de, ja", LOCALES)).toBeUndefined();
  });
});
