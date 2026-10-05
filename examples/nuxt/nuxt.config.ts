import { defineNuxtConfig } from "nuxt/config";

/**
 * The Fibber example.
 *
 * The message wiring lives in `fibber.config.ts`: the module finds it and
 * builds it through `@fibber/kit`, so no `fibber` options are needed here.
 * The module renders each visitor in one locale — their cookie, else what
 * their browser asks for — and provides `$t`, `useFibber` and `useLocale`.
 */
export default defineNuxtConfig({
  compatibilityDate: "2026-07-01",
  modules: ["@fibber/nuxt"],
});
