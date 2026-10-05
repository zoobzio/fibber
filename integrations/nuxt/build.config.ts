import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [
    "src/module",
    "src/config",
    "src/constant",
    { input: "src/server/index", name: "server" },
    // The runtime is shipped unbundled: Nuxt resolves these files by path and
    // compiles them in the app, where the #app/#imports/#build virtuals exist.
    { input: "src/runtime/", outDir: ".dist/runtime", builder: "mkdist" },
  ],
  outDir: ".dist",
  declaration: true,
  externals: [
    "#app",
    "#imports",
    "#build/fibber/index.mjs",
    "#build/fibber/bundles.mjs",
    "@fibber/kit",
    "@nuxt/kit",
    "@nuxt/schema",
    "fibber-lang",
    "nuxt",
    "vue",
    "h3",
  ],
  rollup: {
    emitCJS: false,
  },
});
