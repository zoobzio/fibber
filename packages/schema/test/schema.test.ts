import { describe, expect, it } from "vitest";

import { SchemaError } from "../src/error";
import { defineSchema } from "../src/schema";

const schema = defineSchema({
  locale: "en",
  locales: ["en", "fr"],
  messages: ["greeting", "title"],
} as const);

/** The issues of the SchemaError a call must throw. */
const issues = (run: () => void) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaError);
    return (error as SchemaError).issues;
  }
  throw new Error("did not throw");
};

describe("defineSchema", () => {
  it("keeps the definition it was derived from", () => {
    expect(schema.definition.locale).toBe("en");
  });

  it("checks locales and messages against the contract", () => {
    expect(schema.check.locale("fr")).toBe(true);
    expect(schema.check.locale("de")).toBe(false);
    expect(schema.check.locale(7)).toBe(false);
    expect(schema.check.key("title")).toBe(true);
    expect(schema.check.key("toString")).toBe(false);
  });

  it("accepts a bundle holding any part of the contract", () => {
    expect(schema.check.bundle({})).toBe(true);
    expect(
      schema.check.bundle({ title: [{ type: 0, value: "Welcome" }] }),
    ).toBe(true);
  });

  it("rejects a bundle that is not a record", () => {
    expect(schema.check.bundle(null)).toBe(false);
    expect(schema.check.bundle([])).toBe(false);
  });

  it("reports every entry outside the contract or not compiled", () => {
    expect(
      issues(() =>
        schema.assert.bundle({
          title: "Welcome",
          greeting: [{ value: "no type" }],
          retired: [],
        }),
      ),
    ).toEqual([
      { message: "is not a compiled message", path: ["title"] },
      { message: "is not a compiled message", path: ["greeting"] },
      { message: "is not a message of the contract", path: ["retired"] },
    ]);
  });

  it("checks a time zone and a convention against the runtime", () => {
    expect(schema.check.timeZone("Europe/Paris")).toBe(true);
    expect(schema.check.timeZone("UTC")).toBe(true);
    expect(schema.check.timeZone("Mars/Olympus")).toBe(false);
    expect(schema.check.timeZone(undefined)).toBe(false);
    expect(schema.check.convention("en-GB-u-hc-h23")).toBe(true);
    expect(schema.check.convention("not a locale")).toBe(false);
    expect(schema.check.convention("")).toBe(false);
    expect(() => schema.assert.timeZone("Mars/Olympus")).toThrow(
      '"Mars/Olympus" is not an IANA time zone',
    );
    expect(() => schema.assert.convention(7)).toThrow(SchemaError);
  });

  it("throws a SchemaError naming the path of each issue", () => {
    expect(() => schema.assert.bundle({ retired: [] })).toThrow(
      "retired: is not a message of the contract",
    );
    expect(() => schema.assert.locale("de")).toThrow(
      '"de" is not a locale of the contract',
    );
    expect(() => schema.assert.key("nope")).toThrow(SchemaError);
  });
});
