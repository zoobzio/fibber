import type * as Source from "../src/index";

import { describe, expect, it } from "vitest";

// The built entry: what a consumer installs, FormatJS's runtime inlined.
import source from "../.dist/index.mjs?raw";
import { contract, en } from "./fixture";

describe("the built package", () => {
  it("ships no ICU parser and imports nothing of FormatJS", () => {
    expect(source).not.toContain("EXPECT_ARGUMENT_CLOSING_BRACE");
    expect(source).not.toMatch(/from ["']@formatjs\//);
    expect(source).not.toMatch(/from ["']intl-messageformat["']/);
  });

  it("formats compiled messages", async () => {
    const built: typeof Source = await import("../.dist/index.mjs");
    const fibber = built.makeFibber(contract, {
      locale: "en",
      messages: en,
      timeZone: "UTC",
    });
    const $t = fibber.createResolver();
    expect($t.inbox({ count: 2 })).toBe("2 new messages");
    expect($t.price({ amount: 5 })).toBe("€5.00");
    expect($t.seen({ at: Date.UTC(2026, 0, 5, 23, 30) })).toBe(
      "Seen Jan 5, 2026 at 11:30 PM",
    );
    expect($t.terms({ link: (chunks) => `[${chunks.join("")}]` })).toBe(
      "Read the [terms]",
    );
  });
});
