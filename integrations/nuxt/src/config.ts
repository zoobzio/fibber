import type { KitConfig } from "@fibber/kit";

/**
 * The module's configuration. The messages are always authored as FormatJS
 * message descriptors that a `@fibber/kit` config points at; the module
 * takes them one of two ways —
 *
 * - **Built here.** With no `build`, the module loads the app's own
 *   `fibber.config.ts` and builds it through the kit at build time. No
 *   options are needed at all; with `translate`, it translates first.
 * - **Built elsewhere.** Point `build` at the output of a kit build —
 *   a content package in a monorepo, or a published one — and the module
 *   uses it from where it stands:
 *
 *   ```ts
 *   export default defineNuxtConfig({
 *     fibber: { build: "@acme/messages" },
 *   });
 *   ```
 */
export interface NuxtFibberConfig {
  /**
   * The kit config to build from, relative to the project root. Defaults to
   * `fibber.config.ts`. Ignored when a `build` is passed.
   */
  config?: string;

  /**
   * How to translate, as the kit config's own `translate`: the model — from
   * any AI SDK provider — its call settings, and the project's instructions.
   * Present, the module translates before it builds, exactly as
   * `fibber translate` does: what each locale is missing or has out of
   * date is translated and written to the translations directory, and
   * nothing else is touched. Takes the place of the kit config's
   * `translate`. Ignored when a `build` is passed, and during
   * `nuxt prepare`.
   */
  translate?: NonNullable<KitConfig["translate"]>;

  /**
   * A kit build made elsewhere: the output directory `fibber build` wrote.
   * A path — relative to the project root, or absolute — to the directory or
   * its `index.mjs`, or a package whose main entry is that `index.mjs`.
   */
  build?: string;
}

/**
 * Identity helper that types a Nuxt Fibber configuration.
 *
 * @param config - The Nuxt Fibber configuration.
 * @returns The same config.
 */
export const defineFibberConfig = (config: NuxtFibberConfig) => config;
