import { defineConfig } from "@fibber/kit";

/**
 * The app's messages and content. The `@fibber/nuxt` module finds this
 * file and builds it through `@fibber/kit` at build time.
 *
 * The source messages are the JSON files under `messages/`, each one's keys
 * nested under its name: `title` in `page.json` is `$t.page.title()`. The
 * French and German translations under `.i18n/` mirror them, file for file;
 * they are written by hand and checked in, so the example builds with no
 * model and no API key. To have a model maintain them instead, add a
 * `translate.model` here and run `fibber translate`.
 */
export default defineConfig({
  source: "messages",
  locale: "en",
  locales: ["fr", "de"],
  content: "content",
  formats: {
    number: { price: { style: "currency", currency: "EUR" } },
  },
  translations: ".i18n",
});
