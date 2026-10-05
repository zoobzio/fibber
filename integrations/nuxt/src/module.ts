import type { NuxtFibberConfig } from "./config";

import {
  defineNuxtModule,
  addTemplate,
  addPlugin,
  addImports,
  createResolver,
} from "@nuxt/kit";

import { CONTENT_URL, MODULES } from "./constant";
import { loadSource } from "./kit";

/**
 * Nuxt module for fibber.
 *
 * Its messages are always FormatJS descriptors built by `@fibber/kit`:
 * either the app's own `fibber.config.ts`, built here, or the output of a
 * kit build made elsewhere, which `build` points at. Built here, the module
 * first translates what the locales are missing when given `translate`, then
 * compiles the source messages and every locale's translations at build
 * time and writes the kit's output — the `index` contract module, the
 * `bundles` loaders, each locale's bundle and the content documents — as
 * build templates under `fibber/`. Built elsewhere, the same `index` and
 * `bundles` modules re-export the build's own. Either way it serves the
 * content documents as static files, and registers the runtime plugin and
 * the `useFibber`, `useT`, `useLocale` and `useDocument` auto-imports.
 *
 * A visitor gets one locale. The server picks it — their cookie, else the
 * best match for the languages their browser asks for, else the source
 * locale — and renders with that locale's bundle; the browser loads the same
 * bundle as its own chunk, and another only when the visitor switches.
 *
 * It registers no server routes. An app that serves its bundles over the
 * catalog protocol mounts a handler itself, in a server route file of its
 * choosing, with `createLocaleHandler` from `@fibber/nuxt/server`.
 */
export default defineNuxtModule<NuxtFibberConfig>({
  meta: {
    name: "fibber",
    configKey: "fibber",
  },
  setup: async (options, nuxt) => {
    const resolver = createResolver(import.meta.url);

    const source = await loadSource(options, nuxt);

    /*
     * The kit's output, exactly as `fibber build` writes it. One generator —
     * the kit's — serves the CLI and this module, so an app importing
     * `#build/fibber/*` and a package importing a kit build see the same
     * files. The bundles are modules the `bundles` module imports lazily, so
     * the app's bundler gives each locale a chunk of its own. A build made
     * elsewhere is the same files already written: the templates re-export
     * its modules rather than generate them.
     */
    for (const file of source.files) {
      addTemplate({
        filename: `${MODULES}/${file.path}`,
        write: true,
        getContents: () => file.contents,
      });
    }

    /*
     * The content documents are files a page fetches, not modules it
     * imports: the build's copy is served as static assets, each
     * locale's documents under its own path, so a visitor downloads the
     * document they open in the locale they are in and nothing else.
     */
    if (source.content !== undefined) {
      nuxt.options.nitro.publicAssets ||= [];
      nuxt.options.nitro.publicAssets.push({
        dir: source.content,
        baseURL: CONTENT_URL,
        // The paths carry no content hash, so a document must not outlive
        // the build that wrote it in a visitor's cache.
        maxAge: 0,
      });
    }

    addPlugin({
      src: resolver.resolve("./runtime/plugin"),
    });

    addImports([
      ...["useFibber", "useT", "useLocale", "useDocument"].map((name) => ({
        from: resolver.resolve("./runtime/composable"),
        name,
      })),
      {
        from: resolver.resolve("./runtime/store"),
        name: "accessFibber",
      },
      ...[
        "AppFibberContract",
        "AppFibberLocale",
        "AppFibberKey",
        "AppFibberMessage",
        "AppFibberDocument",
        "AppFibberBundle",
        "AppFibberConfig",
        "AppFibberSelection",
        "AppFibberResolver",
        "AppFibber",
      ].map((name) => ({
        from: resolver.resolve("./runtime/types"),
        name,
        type: true,
      })),
    ]);
  },
});
