// Typecheck-only stub for the generated `#build/fibber/bundles.mjs` virtual
// module.
import type { Bundle } from "fibber";
import type { Contract, Locale } from "./index.mjs";

export declare const bundles: {
  readonly [L in Locale]: () => Promise<Bundle<Contract>>;
};
