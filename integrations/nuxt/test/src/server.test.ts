import type { EventHandler } from "h3";
import type { Provider } from "fibber/catalog";

import { createApp, createRouter, toWebHandler } from "h3";
import { describe, it, expect } from "vitest";

import { defineClient, toEntries } from "fibber/catalog";
import { defineSchema } from "fibber";

import { createLocaleHandler } from "../../src/server";
import { contract } from "../../src/stubs/build/fibber/index.mjs";
import { bundles } from "../../src/stubs/build/fibber/bundles.mjs";

/** The base the handler is mounted under, as a route file's folder would be. */
const BASE = "http://app.test/api/fibber";

/** A provider over the stub bundles. */
const provider: Provider = {
  list: () => toEntries(contract),
  get: (locale) =>
    Object.hasOwn(bundles, locale)
      ? bundles[locale as keyof typeof bundles]()
      : undefined,
};

/**
 * Serves a handler the way Nitro does for a catch-all route file at
 * `server/api/fibber/[...path].get.ts`: every request under the base reaches
 * it, and it reads the rest of the path itself.
 */
const serve = (handler: EventHandler) => {
  const app = createApp();
  app.use("/api/fibber", handler);
  const web = toWebHandler(app);
  return (path: string) => web(new Request(`${BASE}${path}`));
};

describe("createLocaleHandler", () => {
  it("answers the listing at {base}/locales", async () => {
    const response = await serve(createLocaleHandler(provider))("/locales");
    expect(await response.json()).toEqual([
      { id: "en", name: "English" },
      { id: "fr", name: "français" },
      { id: "pt-BR", name: "português (Brasil)" },
    ]);
  });

  it("answers one bundle at {base}/locales/{locale}", async () => {
    const response = await serve(createLocaleHandler(provider))("/locales/fr");
    expect((await response.json()).title).toEqual([
      { type: 0, value: "Bienvenue" },
    ]);
  });

  it("answers 404 for a locale the provider does not hold", async () => {
    const response = await serve(createLocaleHandler(provider))("/locales/de");
    expect(response.status).toBe(404);
  });

  it("answers 404 for any other path below the base", async () => {
    const request = serve(createLocaleHandler(provider));
    expect((await request("/bundles")).status).toBe(404);
    expect((await request("/locales/fr/extra")).status).toBe(404);
  });

  it("answers 400 for a locale that does not decode", async () => {
    const response = await serve(createLocaleHandler(provider))("/locales/%E0");
    expect(response.status).toBe(400);
  });

  it("answers 500 when the provider's listing is not one", async () => {
    const handler = createLocaleHandler({ ...provider, list: () => "nope" });
    expect((await serve(handler)("/locales")).status).toBe(500);
  });

  it("serves from a catch-all route, whatever the catch-all is named", async () => {
    const app = createApp();
    const router = createRouter();
    router.get("/api/fibber/**:rest", createLocaleHandler(provider));
    app.use(router);
    const web = toWebHandler(app);
    const response = await web(new Request(`${BASE}/locales/fr`));
    expect(response.status).toBe(200);
  });

  it("is read unchanged by the catalog client", async () => {
    const request = serve(createLocaleHandler(provider));
    const client = defineClient(defineSchema(contract), {
      base: BASE,
      fetch: (input) => request(String(input).slice(BASE.length)),
    });
    await expect(client.list()).resolves.toHaveLength(3);
    const french = await client.get("fr");
    expect(french?.title).toEqual([{ type: 0, value: "Bienvenue" }]);
    await expect(client.get("pt-BR")).resolves.toBeDefined();
  });
});
