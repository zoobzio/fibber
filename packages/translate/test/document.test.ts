import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";

import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { DOCUMENT_PROMPT, translateDocument } from "../src/document";
import {
  TranslationIncompleteError,
  TranslationRefusedError,
} from "../src/error";

/** The text of one role's message in a call's prompt. */
const said = (call: LanguageModelV4CallOptions, role: "system" | "user") => {
  const message = call.prompt.find((entry) => entry.role === role);
  if (message === undefined || typeof message.content === "string") {
    return message?.content ?? "";
  }
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
};

/** A model that always answers `text`, stopping for `finish`. */
const fixed = (
  text: string,
  finish: "stop" | "length" | "content-filter" = "stop",
) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: { unified: finish, raw: undefined },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });

const REQUEST = {
  source: "en",
  target: "fr",
  path: "guide/intro.md",
  document: "# Welcome\n\nHello.\n",
};

describe("translateDocument", () => {
  it("resolves the translated document, ending as its source does", async () => {
    const model = fixed("\n# Bienvenue\n\nBonjour.\n\n");
    await expect(translateDocument(REQUEST, { model })).resolves.toBe(
      "# Bienvenue\n\nBonjour.\n",
    );
    await expect(
      translateDocument({ ...REQUEST, document: "# Welcome" }, { model }),
    ).resolves.toBe("# Bienvenue\n\nBonjour.");
  });

  it("sends the locales and the document under the base prompt", async () => {
    const model = fixed("# Bienvenue");
    await translateDocument(REQUEST, { model });
    const [call] = model.doGenerateCalls;
    expect(said(call!, "system")).toBe(DOCUMENT_PROMPT);
    expect(said(call!, "user")).toBe(
      "Translate this Markdown document from en to fr.\n\n<document>\n# Welcome\n\nHello.\n\n</document>",
    );
    expect(call?.responseFormat?.type ?? "text").toBe("text");
  });

  it("sends the existing translation to bring up to date", async () => {
    const model = fixed("# Bienvenue");
    await translateDocument(
      { ...REQUEST, previous: "# Bienvenue\n\nSalut.\n" },
      { model },
    );
    expect(said(model.doGenerateCalls[0]!, "user")).toContain(
      "<existing_translation>\n# Bienvenue\n\nSalut.\n\n</existing_translation>",
    );
  });

  it("applies the project's instructions and the SDK's settings", async () => {
    const model = fixed("# Bienvenue");
    await translateDocument(REQUEST, {
      model,
      instructions: "Address the reader informally.",
      temperature: 0.2,
      size: 10,
    });
    const [call] = model.doGenerateCalls;
    expect(said(call!, "system")).toBe(
      `${DOCUMENT_PROMPT}\n\nInstructions specific to this project:\n\nAddress the reader informally.`,
    );
    expect(call?.temperature).toBe(0.2);
  });

  it("throws when the model declines", async () => {
    const error = await translateDocument(REQUEST, {
      model: fixed("", "content-filter"),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TranslationRefusedError);
    expect(error).toMatchObject({ keys: ["guide/intro.md"] });
  });

  it("throws when the response runs out of tokens", async () => {
    const error = await translateDocument(REQUEST, {
      model: fixed("# Bien", "length"),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TranslationIncompleteError);
    expect(error).toMatchObject({ reason: "length" });
  });
});
