import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index", "src/catalog"],
  outDir: ".dist",
  declaration: true,
  rollup: {
    emitCJS: false,
  },
});
