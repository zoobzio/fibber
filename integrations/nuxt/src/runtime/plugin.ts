import { defineNuxtPlugin } from "#app";
import { useHead } from "#imports";
import { computed } from "vue";
import { makeFibber } from "./client";

/**
 * The direction a locale's script is written in. Read off the platform's
 * locale data where it has any; left-to-right otherwise.
 */
const direction = (locale: string): string => {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => { direction?: string };
      textInfo?: { direction?: string };
    };
    return (info.getTextInfo?.() ?? info.textInfo)?.direction ?? "ltr";
  } catch {
    return "ltr";
  }
};

/**
 * Nuxt plugin that builds the Fibber service over reactive, per-request
 * state and provides it as `$fibber`, with its messages as `$t` and the
 * locale switch as `$setLocale`.
 *
 * The visitor's selection is held in {@link useState} so the browser starts
 * from the locale the server rendered with; the plugin awaits that locale's
 * bundle before the app renders, on both sides, so the first render and the
 * hydration read the same messages. The active locale is mirrored onto the
 * document root as `lang` and `dir`, and follows every switch.
 */
export default defineNuxtPlugin({
  name: "fibber",
  setup: async (nuxtApp) => {
    const { service, setLocale } = await makeFibber(nuxtApp);

    useHead({
      htmlAttrs: {
        lang: computed(() => service.config.locale),
        dir: computed(() => direction(service.config.locale)),
      },
    });

    await nuxtApp.callHook("fibber:ready", service);

    return {
      provide: {
        fibber: service,
        t: service.createResolver(),
        setLocale,
      },
    };
  },
});
