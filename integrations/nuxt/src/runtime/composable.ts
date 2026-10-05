import type { ComputedRef } from "vue";
import type {
  AppFibber,
  AppFibberDocument,
  AppFibberLocale,
  AppFibberResolver,
  SetLocale,
} from "./types";

import { computed } from "vue";
import { useNuxtApp } from "#app";
import { useAsyncData, useRequestFetch } from "#imports";
import { CONTENT_URL } from "../constant";

/**
 * Composable for the app's Fibber service: the formatting helpers
 * (`number`, `date`, `time`, `relative`, `list`, `name`), the time zone and
 * convention, and the raw state. Everything it reads is reactive, so a
 * template that calls it re-renders when the locale, time zone or convention
 * changes.
 */
export const useFibber = (): AppFibber => {
  const { $fibber } = useNuxtApp();
  return $fibber;
};

/**
 * Composable for the app's messages as functions — the same object templates
 * reach as `$t`: `t.greeting({ name })`. Each call formats in the locale
 * active at that moment.
 */
export const useT = (): AppFibberResolver => {
  const { $t } = useNuxtApp();
  return $t;
};

/**
 * Composable for the locale: the active one, the ones the app is built for,
 * and the switch. `setLocale` loads the locale's bundle before anything
 * changes, so the page never renders a locale it does not hold.
 */
export const useLocale = (): {
  locale: ComputedRef<AppFibberLocale>;
  locales: readonly AppFibberLocale[];
  setLocale: SetLocale;
} => {
  const { $fibber, $setLocale } = useNuxtApp();
  return {
    locale: computed(() => $fibber.config.locale),
    locales: $fibber.locales(),
    setLocale: $setLocale,
  };
};

/**
 * Composable for one content document, as Markdown text, in the active
 * locale. The document is fetched as the static file the build wrote for
 * that locale — the server render includes it, and a locale switch fetches
 * the other locale's copy. Rendering the Markdown is the app's own.
 *
 * @param path - The document's path under the content directory.
 */
export const useDocument = (path: AppFibberDocument) => {
  const { $fibber } = useNuxtApp();
  const request = useRequestFetch();
  return useAsyncData(
    `fibber:document:${path}`,
    () =>
      request<string>(`${CONTENT_URL}/${$fibber.config.locale}/${path}`, {
        responseType: "text",
      }),
    { watch: [() => $fibber.config.locale] },
  );
};
