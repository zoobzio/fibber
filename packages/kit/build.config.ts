import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index", "src/cli"],
  outDir: ".dist",
  declaration: true,
  externals: [
    "@formatjs/icu-messageformat-parser",
    "@fibber/schema",
    "@fibber/translate",
    "jiti",
    "objectively",
  ],
  rollup: {
    emitCJS: false,
  },
});
