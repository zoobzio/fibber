import type { AppFibberSelection } from "../../src/runtime/types";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computed, ref, reactive, type Ref } from "vue";

let selection: Ref<AppFibberSelection>;
let cookies: Record<string, { value: unknown }>;
let headers: Record<string, string | undefined>;
const callHook = vi.fn();

vi.mock(
  "#build/fibber/index.mjs",
  () => import("../../src/stubs/build/fibber/index.mjs"),
);
/*
 * The stub's loaders, each behind a spy: the stub module freezes its
 * `bundles`, and the tests need to watch and stall individual loads.
 */
const loaders = vi.hoisted(() => ({
  en: vi.fn(),
  fr: vi.fn(),
  "pt-BR": vi.fn(),
}));

vi.mock("#build/fibber/bundles.mjs", async () => {
  const stub = await import("../../src/stubs/build/fibber/bundles.mjs");
  for (const locale of ["en", "fr", "pt-BR"] as const) {
    loaders[locale].mockImplementation(stub.bundles[locale]);
  }
  return { bundles: loaders };
});

const side = vi.hoisted(() => ({ server: false }));

vi.mock("../../src/runtime/side", () => ({
  onServer: () => side.server,
}));

vi.mock("#imports", () => ({
  useState: (_key: string, init: () => AppFibberSelection) =>
    (selection ??= ref(init())),
  useCookie: (key: string) => (cookies[key] ??= reactive({ value: null })),
  useRequestHeaders: () => headers,
}));

import { makeFibber } from "../../src/runtime/client";

/** Builds the service as one side of a request would. */
const make = (where: "server" | "client") => {
  side.server = where === "server";
  return makeFibber({ callHook });
};

beforeEach(() => {
  selection = undefined as never;
  cookies = {};
  headers = {};
  callHook.mockClear();
  for (const loader of Object.values(loaders)) {
    loader.mockClear();
  }
});

describe("makeFibber on the server", () => {
  it("renders in the source locale with nothing to go on", async () => {
    const { service } = await make("server");
    expect(service.config.locale).toBe("en");
    expect(service.format("title")).toBe("Welcome");
  });

  it("takes the locale from the visitor's cookie", async () => {
    cookies["fibber-locale"] = reactive({ value: "fr" });
    headers = { "accept-language": "pt-BR" };
    const { service } = await make("server");
    expect(service.config.locale).toBe("fr");
    expect(service.format("title")).toBe("Bienvenue");
  });

  it("negotiates the locale when the cookie names none it has", async () => {
    cookies["fibber-locale"] = reactive({ value: "de" });
    headers = { "accept-language": "de, pt-PT;q=0.9, en;q=0.8" };
    const { service } = await make("server");
    expect(service.config.locale).toBe("pt-BR");
    expect(service.format("title")).toBe("Bem-vindo");
  });

  it("takes the time zone and convention from cookies that still hold", async () => {
    cookies["fibber-time-zone"] = reactive({ value: "Asia/Tokyo" });
    cookies["fibber-convention"] = reactive({ value: "en-GB" });
    const { service } = await make("server");
    expect(service.config.timeZone).toBe("Asia/Tokyo");
    expect(service.config.convention).toBe("en-GB");
    expect(service.format("seen", { at: Date.UTC(2026, 0, 5, 23, 30) })).toBe(
      "Seen 6 Jan 2026 at 08:30",
    );
  });

  it("ignores a time zone or convention that is not one", async () => {
    cookies["fibber-time-zone"] = reactive({ value: "Mars/Olympus" });
    cookies["fibber-convention"] = reactive({ value: "not a locale" });
    const { service } = await make("server");
    expect(service.config.timeZone).toBeUndefined();
    expect(service.config.convention).toBeUndefined();
  });

  it("loads only the bundle of the locale it renders", async () => {
    await make("server");
    expect(loaders.en).toHaveBeenCalledTimes(1);
    expect(loaders.fr).not.toHaveBeenCalled();
    expect(loaders["pt-BR"]).not.toHaveBeenCalled();
  });
});

describe("makeFibber in the browser", () => {
  it("starts from the selection the server rendered with", async () => {
    selection = ref({ locale: "fr", timeZone: "UTC" });
    cookies["fibber-locale"] = reactive({ value: "en" });
    const { service } = await make("client");
    expect(service.config.locale).toBe("fr");
    expect(service.config.timeZone).toBe("UTC");
    expect(service.format("inbox", { count: 2 })).toBe("2 nouveaux messages");
  });
});

describe("setLocale", () => {
  it("loads the bundle, applies it, and re-renders what read a message", async () => {
    const { service, setLocale } = await make("client");
    const $t = service.createResolver();
    const title = computed(() => $t.title());
    expect(title.value).toBe("Welcome");
    await setLocale("fr");
    expect(service.config.locale).toBe("fr");
    expect(title.value).toBe("Bienvenue");
  });

  it("persists the locale to its cookie and emits the hook", async () => {
    const { setLocale } = await make("client");
    await setLocale("fr");
    expect(cookies["fibber-locale"]?.value).toBe("fr");
    expect(callHook).toHaveBeenCalledWith("fibber:locale", "fr");
  });

  it("rejects a locale the app is not built for, changing nothing", async () => {
    const { service, setLocale } = await make("client");
    await expect(setLocale("de" as "fr")).rejects.toThrow();
    expect(service.config.locale).toBe("en");
  });

  it("lets the last of overlapping switches win, whatever arrives first", async () => {
    const { service, setLocale } = await make("client");
    let release: () => void = () => {};
    loaders.fr.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {};
    });
    const first = setLocale("fr");
    await setLocale("pt-BR");
    release();
    await first;
    expect(service.config.locale).toBe("pt-BR");
    expect(service.format("title")).toBe("Bem-vindo");
  });
});

describe("time zone and convention", () => {
  it("re-renders dates and persists to cookies", async () => {
    const { service } = await make("client");
    const seen = computed(() =>
      service.format("seen", { at: Date.UTC(2026, 0, 5, 23, 30) }),
    );
    service.setTimeZone("UTC");
    expect(seen.value).toBe("Seen Jan 5, 2026 at 11:30 PM");
    service.setTimeZone("Asia/Tokyo");
    expect(seen.value).toBe("Seen Jan 6, 2026 at 8:30 AM");
    service.setConvention("en-GB");
    expect(seen.value).toBe("Seen 6 Jan 2026 at 08:30");
    expect(cookies["fibber-time-zone"]?.value).toBe("Asia/Tokyo");
    expect(cookies["fibber-convention"]?.value).toBe("en-GB");
    service.setTimeZone(undefined);
    expect(cookies["fibber-time-zone"]?.value).toBeNull();
  });

  it("clears the convention's cookie when the locale changes", async () => {
    const { service, setLocale } = await make("client");
    service.setConvention("en-GB");
    await setLocale("fr");
    expect(service.config.convention).toBeUndefined();
    expect(cookies["fibber-convention"]?.value).toBeNull();
  });
});
