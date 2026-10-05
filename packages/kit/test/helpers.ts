import type { KitConfig } from "../src/types";

import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The fixtures directory: source messages and a partial French translation. */
export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** The config the fixtures are built under. */
export const CONFIG = {
  source: "messages.json",
  locale: "en",
  locales: ["fr"],
  formats: {
    number: { price: { style: "currency", currency: "EUR" } },
  },
} satisfies KitConfig;

/**
 * A throwaway project root holding a copy of the fixtures, for tests that
 * write or rewrite documents.
 */
export const project = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "fibber-kit-"));
  await cp(FIXTURES, root, { recursive: true });
  return root;
};

/** Removes a root {@link project} made. */
export const discard = async (root: string): Promise<void> => {
  await rm(root, { recursive: true, force: true });
};
