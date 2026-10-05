import { readFile } from "node:fs/promises";

import { record } from "objectively";

import type { Descriptor } from "./types";
import { InvalidDocumentError } from "./error";

/**
 * Reads a JSON document that must hold an object. `undefined` when there is
 * no file at `path` and `optional` allows that.
 */
const document = async (
  path: string,
  optional: boolean,
): Promise<Record<string, unknown> | undefined> => {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (
      optional &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw new InvalidDocumentError(path, "could not be read", { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new InvalidDocumentError(path, "is not valid JSON", { cause: error });
  }
  if (!record(parsed)) {
    throw new InvalidDocumentError(path, "must hold a JSON object");
  }
  return parsed;
};

/**
 * Reads the source messages: a FormatJS message-descriptor document, every
 * key mapped to its `defaultMessage` and optional `description`.
 *
 * @param path - The absolute path of the document.
 * @throws InvalidDocumentError when the file is missing, is not JSON, or an
 * entry is not a descriptor.
 */
export const readSource = async (
  path: string,
): Promise<Record<string, Descriptor>> => {
  const parsed = (await document(path, false)) ?? {};
  const source: Record<string, Descriptor> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (!record(entry) || typeof entry.defaultMessage !== "string") {
      throw new InvalidDocumentError(
        path,
        `must map ${JSON.stringify(key)} to a descriptor ({ "defaultMessage": "…" })`,
      );
    }
    if (
      entry.description !== undefined &&
      typeof entry.description !== "string"
    ) {
      throw new InvalidDocumentError(
        path,
        `must give ${JSON.stringify(key)} a string description`,
      );
    }
    source[key] = {
      defaultMessage: entry.defaultMessage,
      ...(entry.description === undefined
        ? {}
        : { description: entry.description }),
    };
  }
  return source;
};

/**
 * Reads one locale's translations: a flat map of message key to translated
 * ICU message. `undefined` when the locale has no file yet — nothing is
 * translated, which is not an error.
 *
 * @param path - The absolute path of the document.
 * @throws InvalidDocumentError when the file is not JSON or an entry is not a
 * string.
 */
export const readTranslations = async (
  path: string,
): Promise<Record<string, string> | undefined> => {
  const parsed = await document(path, true);
  if (parsed === undefined) {
    return undefined;
  }
  const translations: Record<string, string> = {};
  for (const [key, message] of Object.entries(parsed)) {
    if (typeof message !== "string") {
      throw new InvalidDocumentError(
        path,
        `must map ${JSON.stringify(key)} to a message string`,
      );
    }
    translations[key] = message;
  }
  return translations;
};
