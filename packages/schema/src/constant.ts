/**
 * The named formats every contract has without declaring them — FormatJS's
 * defaults, less `currency`, which names no currency and so cannot format.
 * A contract's own formats are declared in `fibber.config.ts`, and may
 * redefine these.
 */
export const FORMATS = {
  number: ["integer", "percent"],
  date: ["short", "medium", "long", "full"],
  time: ["short", "medium", "long", "full"],
} as const;
