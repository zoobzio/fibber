import { generateText } from "ai";

import type { TranslateDocument } from "./types";
import { TranslationIncompleteError, TranslationRefusedError } from "./error";

/**
 * The base prompt every document translation runs under: what to translate,
 * what is structure and must survive, and how to bring an existing
 * translation up to date rather than start over. A project's own
 * instructions are appended, never substituted.
 */
export const DOCUMENT_PROMPT = `You translate the Markdown content of a software product from one locale to another.

The document is rendered by the same pipeline in every locale, so its structure is code: the prose is yours to translate, everything the renderer or a reader's tooling depends on has to come through unchanged.

- Translate prose, headings, list items, table cells, link text and image alt text.
- In front matter, keep every key as it is and translate only values that are prose a reader sees (a title, a description). Leave values that are data — dates, booleans, slugs, ids, tags used as identifiers, paths — untouched.
- Leave fenced code blocks and inline code exactly as written, comments included: readers copy them, and a build may check them.
- Leave URLs, link targets, anchors, reference labels, file paths and HTML or component tags and their attributes as they are. Translate the text between tags when it is prose.
- Keep the Markdown structure: the same headings at the same levels, the same lists, tables, block quotes and line breaks between blocks, in the same order.
- Leave product names, and placeholders such as {name}, as they are.

Translate for native speakers: natural phrasing over word-for-word fidelity, in the tone and register of the source.

When an existing translation is given, it was made from an earlier version of the source, and people may have edited it by hand. Bring it up to date rather than starting over: keep its wording wherever it still faithfully renders the current source, translate only what is new or has changed, and drop what the source no longer says. Unchanged passages should come back identical, so a reviewer sees only real changes.

Reply with the translated document and nothing else — no commentary, and no code fence around it.`;

/**
 * The system prompt of a document run: the base prompt, then the project's
 * own instructions when it has any.
 */
const system = (instructions: string | undefined): string => {
  if (instructions === undefined || instructions.trim() === "") {
    return DOCUMENT_PROMPT;
  }
  return `${DOCUMENT_PROMPT}\n\nInstructions specific to this project:\n\n${instructions.trim()}`;
};

/**
 * Translates one Markdown document from one locale to another through the
 * AI SDK, or — given the translation it already has — brings that
 * translation up to date with the source. The document goes out whole, in
 * one request; every option but `instructions` and `size` is handed to the
 * SDK as it is.
 *
 * Nothing here judges the result: whether the structure survived is for the
 * caller to prove.
 *
 * @param request - The locales, the document, and any existing translation.
 * @param options - The model, the SDK's call settings, and instructions.
 * @returns The translated document.
 * @throws TranslationRefusedError when the model declines the document.
 * @throws TranslationIncompleteError when the response is cut short.
 */
export const translateDocument: TranslateDocument = async (
  request,
  options,
) => {
  const { instructions, ...settings } = options;
  // A document goes out whole: `size` is for messages, not the SDK's.
  delete settings.size;
  const parts = [
    `Translate this Markdown document from ${request.source} to ${request.target}.`,
    `<document>\n${request.document}\n</document>`,
  ];
  if (request.previous !== undefined) {
    parts.push(
      `<existing_translation>\n${request.previous}\n</existing_translation>`,
    );
  }

  const result = await generateText({
    ...settings,
    system: system(instructions),
    prompt: parts.join("\n\n"),
  });

  if (result.finishReason === "content-filter") {
    throw new TranslationRefusedError([request.path]);
  }
  if (result.finishReason !== "stop") {
    throw new TranslationIncompleteError([request.path], result.finishReason);
  }

  // A document ends the way its source does: one trailing newline, or none.
  const text = result.text.trim();
  return request.document.endsWith("\n") ? `${text}\n` : text;
};
