import type { Formats } from "@fibber/schema";

import { FORMATS } from "@fibber/schema";

import type { Bundle, Descriptor, Message, Uses } from "./types";
import { compile, declared, fit } from "./compile";

/** Every format name that exists, by kind. */
export type Known = Record<keyof Uses, ReadonlySet<string>>;

/**
 * Every format name a message may refer to: the built-in ones, and the ones
 * the config declares.
 *
 * @param formats - The declared formats, every kind present.
 */
export const knownFormats = (formats: Required<Formats>): Known => {
  return {
    number: new Set([...FORMATS.number, ...Object.keys(formats.number)]),
    date: new Set([...FORMATS.date, ...Object.keys(formats.date)]),
    time: new Set([...FORMATS.time, ...Object.keys(formats.time)]),
  };
};

/** The source messages compiled: the contract, its bundle, and what failed. */
export interface Contract {
  /** The contract: every message that compiled, in source order. */
  messages: Record<string, Message>;

  /** The source locale's bundle. */
  reference: Bundle;

  /** Every reason a source message was left out, by key. */
  issues: Record<string, string[]>;
}

/**
 * Compiles the source messages into the contract: each message's arguments
 * and AST, with the named formats it refers to checked against the ones
 * that exist.
 *
 * @param source - The source messages, as authored.
 * @param known - Every format name that exists.
 */
export const compileSource = (
  source: Record<string, Descriptor>,
  known: Known,
): Contract => {
  const contract: Contract = { messages: {}, reference: {}, issues: {} };
  for (const [key, descriptor] of Object.entries(source)) {
    const compiled = compile(descriptor.defaultMessage);
    const found = compiled.ok
      ? declared(compiled.value.formats, known)
      : compiled.issues;
    if (found.length > 0) {
      contract.issues[key] = found;
    }
    if (!compiled.ok) {
      continue;
    }
    contract.reference[key] = compiled.value.ast;
    contract.messages[key] = {
      arguments: compiled.value.arguments,
      source: descriptor.defaultMessage,
      ...(descriptor.description === undefined
        ? {}
        : { description: descriptor.description }),
    };
  }
  return contract;
};

/** A translation compiled against its source, or every reason it does not hold. */
export type Checked =
  | { ok: true; ast: Bundle[string] }
  | { ok: false; ast?: Bundle[string]; issues: string[] };

/**
 * Proves one translation against the message it translates: it must compile,
 * take nothing its source does not, and refer only to formats that exist.
 *
 * @param translation - The translated ICU message.
 * @param message - The contract's message it translates.
 * @param known - Every format name that exists.
 */
export const checkTranslation = (
  translation: string,
  message: Message,
  known: Known,
): Checked => {
  const compiled = compile(translation);
  if (!compiled.ok) {
    return { ok: false, issues: compiled.issues };
  }
  const issues = [
    ...fit(message.arguments, compiled.value.arguments),
    ...declared(compiled.value.formats, known),
  ];
  if (issues.length > 0) {
    return { ok: false, ast: compiled.value.ast, issues };
  }
  return { ok: true, ast: compiled.value.ast };
};
