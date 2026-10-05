import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, reactive, type Ref } from "vue";

let states: Record<string, Ref<unknown>>;
let cookies: Record<string, { value: unknown }>;

vi.mock(
  "#build/fibber/index.mjs",
  () => import("../../src/stubs/build/fibber/index.mjs"),
);

vi.mock("#imports", () => ({
  useState: (key: string, init: () => unknown) => (states[key] ??= ref(init())),
  useCookie: (key: string) => (cookies[key] ??= reactive({ value: null })),
}));

import { accessFibber } from "../../src/runtime/store";

describe("accessFibber", () => {
  beforeEach(() => {
    states = {};
    cookies = {};
  });

  it("seeds the selection with the source locale, and nothing else", () => {
    const store = accessFibber();
    expect(store.selection.value).toEqual({ locale: "en" });
    expect(Object.keys(states)).toEqual(["fibber:selection"]);
  });

  it("shares one selection between callers", () => {
    accessFibber().selection.value.locale = "fr";
    expect(accessFibber().selection.value.locale).toBe("fr");
  });

  it("keeps the selection in three cookies", () => {
    accessFibber();
    expect(Object.keys(cookies)).toEqual([
      "fibber-locale",
      "fibber-time-zone",
      "fibber-convention",
    ]);
  });
});
