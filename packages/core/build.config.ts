import { defineBuildConfig } from "unbuild";

/**
 * `intl-messageformat` is inlined rather than depended on. Its entry imports
 * the ICU parser to accept message strings, which a bundler cannot shake out;
 * the service only ever formats the ASTs `@fibber/kit` compiled, so the
 * import is pointed at FormatJS's own parser-less entry and the result is
 * bundled — no consumer ships a parser, and none has to alias anything. The
 * licences of the inlined code travel in THIRD_PARTY_LICENSES.md.
 */
export default defineBuildConfig({
  entries: ["src/index"],
  outDir: ".dist",
  declaration: true,
  alias: {
    "@formatjs/icu-messageformat-parser":
      "@formatjs/icu-messageformat-parser/no-parser.js",
  },
  rollup: {
    emitCJS: false,
    inlineDependencies: true,
  },
});
