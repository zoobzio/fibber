import { NoObjectGeneratedError, Output, generateText } from "ai";
import { z } from "zod";

import type { Source, Translate } from "./types";
import { SIZE } from "./constant";
import { TranslationIncompleteError, TranslationRefusedError } from "./error";
import { system } from "./prompt";

/**
 * The shape every response is constrained to, and validated against: a
 * translation per message, under its key. A list rather than a map, since
 * the keys are data.
 */
const OUTPUT = Output.object({
  schema: z.object({
    translations: z.array(z.object({ key: z.string(), message: z.string() })),
  }),
});

/**
 * The error for a response that gave no usable answer: a refusal when the
 * provider's content filter stopped it, incomplete otherwise.
 */
const unfinished = (
  keys: string[],
  reason: string | undefined,
  cause?: unknown,
): Error => {
  if (reason === "content-filter") {
    return new TranslationRefusedError(keys, { cause });
  }
  return new TranslationIncompleteError(
    keys,
    reason === undefined || reason === "stop"
      ? "not the structure asked for"
      : reason,
    { cause },
  );
};

/** The entries of a record in runs of at most `size`. */
const batches = <T>(entries: [string, T][], size: number): [string, T][][] => {
  const runs: [string, T][][] = [];
  for (let start = 0; start < entries.length; start += size) {
    runs.push(entries.slice(start, start + size));
  }
  return runs;
};

/**
 * Translates messages from one locale to another through the AI SDK: the
 * base prompt plus the project's instructions as the system prompt, the
 * messages as the request, and a structured response. Messages go out in
 * batches of `size`, one request at a time; every other option is handed to
 * the SDK as it is.
 *
 * A failure of the provider itself surfaces as the SDK's own error, after
 * the SDK's retries.
 *
 * Only keys that were asked for come back, and a key the model skipped is
 * absent. Nothing here judges a translation: whether it parses and fits its
 * source is for the caller to prove.
 *
 * @param request - The locales and the messages to translate.
 * @param options - The model, the SDK's call settings, and instructions.
 * @returns The translations, by key.
 * @throws TranslationRefusedError when the model declines a batch.
 * @throws TranslationIncompleteError when a response is cut short.
 */
export const translate: Translate = async (request, options) => {
  const { instructions, size: sizeOption, ...settings } = options;
  const translations: Record<string, string> = {};
  const size = Math.max(1, Math.floor(sizeOption ?? SIZE));

  for (const batch of batches<Source>(Object.entries(request.messages), size)) {
    const keys = batch.map(([key]) => key);
    const answer = await generateText({
      ...settings,
      output: OUTPUT,
      system: system(instructions),
      prompt: JSON.stringify(
        {
          from: request.source,
          to: request.target,
          messages: batch.map(([key, source]) => ({ key, ...source })),
        },
        null,
        2,
      ),
    }).then(
      (result) => {
        // Why the response stopped is checked before its output is read: a
        // response that did not run to its end has no output to give.
        if (result.finishReason !== "stop") {
          throw unfinished(keys, result.finishReason);
        }
        return result.output;
      },
      (error: unknown) => {
        // The SDK raises this for every response it cannot read as the
        // structure asked for; why the response stopped tells them apart.
        if (NoObjectGeneratedError.isInstance(error)) {
          throw unfinished(keys, error.finishReason, error);
        }
        throw error;
      },
    );

    const asked = new Set(keys);
    for (const { key, message } of answer.translations) {
      if (asked.has(key)) {
        translations[key] = message;
      }
    }
  }

  return translations;
};
