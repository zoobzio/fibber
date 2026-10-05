import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { normalize } from "./path";

/** The extension of the documents the content pipeline carries. */
const EXTENSION = ".md";

/**
 * Lists the Markdown documents under a directory, at any depth, as posix
 * paths relative to it, sorted. A directory that does not exist has none.
 *
 * @param directory - The absolute directory.
 */
export const listDocuments = async (directory: string): Promise<string[]> => {
  let entries: string[];
  try {
    entries = await readdir(directory, { recursive: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.endsWith(EXTENSION))
    .map(normalize)
    .sort();
};

/**
 * Reads one document. `undefined` when there is no file at the path.
 *
 * @param directory - The absolute directory the path is relative to.
 * @param path - The document's posix path.
 */
export const readDocument = async (
  directory: string,
  path: string,
): Promise<string | undefined> => {
  try {
    return await readFile(join(directory, path), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

/**
 * The top-level keys of a document's front matter, in order; `undefined`
 * when it has none. A line scan, not a YAML parse: only the keys are
 * compared, and they sit at the start of a line.
 */
const frontMatter = (document: string): string[] | undefined => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(document);
  if (match === null) {
    return undefined;
  }
  return (match[1] ?? "")
    .split(/\r?\n/)
    .map((line) => /^([A-Za-z0-9_-]+)\s*:/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
};

/**
 * The fenced code blocks of a document, each with its fence line's info
 * string and its body, in order.
 */
const codeBlocks = (document: string): string[] => {
  const blocks: string[] = [];
  let fence: string | undefined;
  let lines: string[] = [];
  for (const line of document.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence === undefined) {
      if (marker !== null) {
        fence = marker[1] ?? "";
        lines = [(marker[2] ?? "").trim()];
      }
      continue;
    }
    const closes =
      marker !== null &&
      (marker[1] ?? "").startsWith(fence) &&
      (marker[2] ?? "").trim() === "";
    if (closes) {
      blocks.push(lines.join("\n"));
      fence = undefined;
      continue;
    }
    lines.push(line);
  }
  if (fence !== undefined) {
    blocks.push(lines.join("\n"));
  }
  return blocks;
};

/**
 * Proves a translated document against its source, as far as can be proven
 * without reading the language: it is not empty, its front matter carries
 * the same keys, and its fenced code blocks are the source's, untouched.
 *
 * @param source - The source document.
 * @param translation - The translated document.
 * @returns Every reason the translation does not hold, empty when it does.
 */
export const checkDocument = (
  source: string,
  translation: string,
): string[] => {
  if (translation.trim() === "") {
    return ["is empty"];
  }
  const issues: string[] = [];

  const expected = frontMatter(source);
  const found = frontMatter(translation);
  if (expected === undefined && found !== undefined) {
    issues.push("has front matter, which the source does not");
  } else if (expected !== undefined && found === undefined) {
    issues.push("lost the source's front matter");
  } else if (expected !== undefined && found !== undefined) {
    const missing = expected.filter((key) => !found.includes(key));
    const added = found.filter((key) => !expected.includes(key));
    if (missing.length > 0) {
      issues.push(`lost the front matter keys ${missing.join(", ")}`);
    }
    if (added.length > 0) {
      issues.push(`added the front matter keys ${added.join(", ")}`);
    }
  }

  const blocks = codeBlocks(source);
  const translated = codeBlocks(translation);
  if (blocks.length !== translated.length) {
    issues.push(
      `has ${translated.length} fenced code blocks where the source has ${blocks.length}`,
    );
  } else {
    for (const [index, block] of blocks.entries()) {
      if (block !== translated[index]) {
        issues.push(`changed fenced code block ${index + 1}`);
      }
    }
  }
  return issues;
};
