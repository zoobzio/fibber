# Nuxt example

A Nuxt app translated with Fibber: one locale per visitor, a language and
time zone picker, typed messages through `$t`, the formatting helpers, and a
Markdown document per locale.

```sh
pnpm build              # from the repo root: build the packages first
pnpm --filter @fibber/example-nuxt dev
```

- `fibber.config.ts` — the source messages, the locales and the content
- `messages/` — the source messages, in English, one file per group:
  `title` in `page.json` is `$t.page.title()`
- `.i18n/` — French and German, mirroring `messages/` file for file, written
  by hand and checked in; one message and the German document are left
  untranslated to show the fallback
- `content/` — the Markdown content, in English
- `app/app.vue` — everything the page does
