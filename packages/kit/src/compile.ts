import type { MessageFormatElement } from "@formatjs/icu-messageformat-parser";

import { TYPE, parse } from "@formatjs/icu-messageformat-parser";
import { record } from "objectively";

import type { Argument, Arguments, Compiled, Uses } from "./types";

/** A message compiled, or every reason it could not be. */
export type Compilation =
  | { ok: true; value: Compiled }
  | { ok: false; issues: string[] };

/**
 * Two uses of one argument as one: the same kind twice is that kind (two
 * selects pool their options), and a plain interpolation yields to whatever
 * the other use needs. `undefined` when the two cannot both be satisfied.
 */
const merge = (a: Argument, b: Argument): Argument | undefined => {
  if (a.kind === "select" && b.kind === "select") {
    return {
      kind: "select",
      options: [...new Set([...a.options, ...b.options])],
    };
  }
  if (a.kind === b.kind || b.kind === "value") {
    return a;
  }
  if (a.kind === "value") {
    return b;
  }
  return undefined;
};

/** What one AST element does with its argument; none for text and `#`. */
const use = (element: MessageFormatElement): Argument | undefined => {
  switch (element.type) {
    case TYPE.argument:
      return { kind: "value" };
    case TYPE.number:
    case TYPE.plural:
      return { kind: "number" };
    case TYPE.date:
    case TYPE.time:
      return { kind: "date" };
    case TYPE.select:
      return { kind: "select", options: Object.keys(element.options) };
    case TYPE.tag:
      return { kind: "tag" };
    default:
      return undefined;
  }
};

/** The messages nested inside an element: option bodies and tag children. */
const nested = (element: MessageFormatElement): MessageFormatElement[][] => {
  switch (element.type) {
    case TYPE.select:
    case TYPE.plural:
      return Object.values(element.options).map((option) => option.value);
    case TYPE.tag:
      return [element.children];
    default:
      return [];
  }
};

/**
 * Notes the named format an element refers to, if any. A style that is a
 * string is a name: skeletons (`::currency/USD`) were resolved by the parse.
 */
const named = (element: MessageFormatElement, uses: Uses): void => {
  const kind =
    element.type === TYPE.number
      ? "number"
      : element.type === TYPE.date
        ? "date"
        : element.type === TYPE.time
          ? "time"
          : undefined;
  if (
    kind !== undefined &&
    "style" in element &&
    typeof element.style === "string" &&
    !uses[kind].includes(element.style)
  ) {
    uses[kind].push(element.style);
  }
};

/**
 * Reads the arguments off an AST, every nesting level included, into
 * `found`, and the named formats into `uses`; a name used as two
 * incompatible kinds lands in `issues`.
 */
const collect = (
  ast: MessageFormatElement[],
  found: Arguments,
  uses: Uses,
  issues: string[],
): void => {
  for (const element of ast) {
    named(element, uses);
    const next = use(element);
    if (next !== undefined && element.type !== TYPE.pound) {
      const name = element.value;
      const known = Object.hasOwn(found, name) ? found[name] : undefined;
      const merged = known === undefined ? next : merge(known, next);
      if (merged === undefined) {
        issues.push(
          `argument ${JSON.stringify(name)} is used as both ${known?.kind} and ${next.kind}`,
        );
      } else {
        found[name] = merged;
      }
    }
    for (const child of nested(element)) {
      collect(child, found, uses, issues);
    }
  }
};

/**
 * A parse failure in words: the parser's error kind, and the line and column
 * it stopped at when it says.
 */
const reason = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if ("location" in error && record(error.location)) {
    const { start } = error.location;
    if (record(start)) {
      return `${error.message} at ${String(start.line)}:${String(start.column)}`;
    }
  }
  return error.message;
};

/**
 * Compiles an ICU message: parses it to the AST the runtime formats —
 * number and date skeletons already resolved to `Intl` options, so the
 * runtime never ships a parser — and reads off the arguments it takes and
 * the named formats it refers to.
 *
 * @param message - The ICU message.
 * @returns The AST and arguments, or the syntax error or argument conflicts
 * that stopped it.
 */
export const compile = (message: string): Compilation => {
  let ast: MessageFormatElement[];
  try {
    ast = parse(message, { shouldParseSkeletons: true });
  } catch (error) {
    return {
      ok: false,
      issues: [`is not valid ICU MessageFormat (${reason(error)})`],
    };
  }
  const found: Arguments = {};
  const issues: string[] = [];
  const uses: Uses = { number: [], date: [], time: [] };
  collect(ast, found, uses, issues);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: { ast, arguments: found, formats: uses } };
};

/**
 * Checks a translation's arguments against its source's: the contract is
 * typed off the source, so a translation may use fewer arguments, or
 * interpolate plainly what the source formats, but never needs something a
 * caller was not asked to pass.
 *
 * @param source - The source message's arguments.
 * @param translation - The translated message's arguments.
 * @returns Every mismatch, empty when the translation fits.
 */
export const fit = (source: Arguments, translation: Arguments): string[] => {
  const issues: string[] = [];
  for (const [name, argument] of Object.entries(translation)) {
    const expected = Object.hasOwn(source, name) ? source[name] : undefined;
    if (expected === undefined) {
      issues.push(
        `takes ${JSON.stringify(name)}, which the source message does not`,
      );
    } else if (argument.kind !== "value" && argument.kind !== expected.kind) {
      issues.push(
        `uses ${JSON.stringify(name)} as ${argument.kind}, but the source message uses it as ${expected.kind}`,
      );
    }
  }
  return issues;
};

/**
 * Checks the named formats a message refers to against the ones that exist.
 * A name with no format behind it would format as if no style were given, so
 * it is an error rather than a fallback — which also catches an ICU pattern
 * (`#,##0.00`) written where FormatJS expects a name or a `::` skeleton.
 *
 * @param uses - The named formats the message refers to.
 * @param known - Every format name that exists, by kind.
 * @returns Every unknown name, empty when all exist.
 */
export const declared = (
  uses: Uses,
  known: Record<keyof Uses, ReadonlySet<string>>,
): string[] => {
  const issues: string[] = [];
  for (const kind of ["number", "date", "time"] as const) {
    for (const name of uses[kind]) {
      if (!known[kind].has(name)) {
        issues.push(
          `uses the ${kind} format ${JSON.stringify(name)}, which is neither built in nor declared in the config's formats`,
        );
      }
    }
  }
  return issues;
};
