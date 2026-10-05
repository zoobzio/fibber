import { describe, expect, it, vi } from "vitest";

import { defineClient } from "../src/client";
import { FailedRequestError, MalformedBundleError } from "../src/error";
import { bundles, entries, schema } from "./fixture";

/** A fetch answering each URL from a table of `[status, body]`. */
const wire = (routes: Record<string, [number, unknown]>) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const [status, body] = routes[String(input)] ?? [404, null];
    return new Response(JSON.stringify(body), { status });
  });

describe("defineClient", () => {
  it("lists from {base}/locales", async () => {
    const fetch = wire({ "/api/lang/locales": [200, entries] });
    const client = defineClient(schema, { base: "/api/lang/", fetch });
    await expect(client.list()).resolves.toEqual(entries);
  });

  it("gets a bundle from {base}/locales/{locale}", async () => {
    const fetch = wire({
      "https://lang.example/locales/fr": [200, bundles.fr],
    });
    const client = defineClient(schema, {
      base: "https://lang.example",
      fetch,
    });
    await expect(client.get("fr")).resolves.toEqual(bundles.fr);
  });

  it("sends the configured headers with every request", async () => {
    const fetch = wire({ "/api/locales": [200, entries] });
    await defineClient(schema, {
      base: "/api",
      headers: { authorization: "Bearer token" },
      fetch,
    }).list();
    expect(fetch).toHaveBeenCalledWith("/api/locales", {
      headers: { accept: "application/json", authorization: "Bearer token" },
    });
  });

  it("resolves a 404 on a retrieval as a miss", async () => {
    const client = defineClient(schema, { base: "/api", fetch: wire({}) });
    await expect(client.get("fr")).resolves.toBeUndefined();
  });

  it("fails on a 404 answering the listing", async () => {
    const client = defineClient(schema, { base: "/api", fetch: wire({}) });
    const error = await client.list().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(FailedRequestError);
    expect(error).toMatchObject({ url: "/api/locales", status: 404 });
  });

  it("fails on any other failure status", async () => {
    const fetch = wire({ "/api/locales/fr": [500, null] });
    await expect(
      defineClient(schema, { base: "/api", fetch }).get("fr"),
    ).rejects.toThrow(FailedRequestError);
  });

  it("proves what the wire answers against the contract", async () => {
    const fetch = wire({ "/api/locales/fr": [200, { retired: [] }] });
    await expect(
      defineClient(schema, { base: "/api", fetch }).get("fr"),
    ).rejects.toThrow(MalformedBundleError);
  });

  it("falls back to the global fetch", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(wire({ "/api/locales": [200, entries] }));
    await expect(
      defineClient(schema, { base: "/api" }).list(),
    ).resolves.toEqual(entries);
    spy.mockRestore();
  });
});
