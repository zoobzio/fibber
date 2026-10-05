import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";

import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import {
  TranslationIncompleteError,
  TranslationRefusedError,
} from "../src/error";
import { PROMPT, system } from "../src/prompt";
import { translate } from "../src/translate";

/** The text of one role's message in a call's prompt. */
const said = (call: LanguageModelV4CallOptions, role: "system" | "user") => {
  const message = call.prompt.find((entry) => entry.role === role);
  if (message === undefined) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
};

/** The messages a call carried, as the prompt serialized them. */
const sent = (call: LanguageModelV4CallOptions) =>
  JSON.parse(said(call, "user")) as {
    from: string;
    to: string;
    messages: { key: string; message: string; description?: string }[];
  };

/** A provider response: its text, and why it stopped. */
const response = (
  text: string,
  finish: "stop" | "length" | "content-filter" = "stop",
) => ({
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
});

/** A model translating every message it is sent by upper-casing it. */
const shout = () =>
  new MockLanguageModelV4({
    doGenerate: async (call) =>
      response(
        JSON.stringify({
          translations: sent(call).messages.map(({ key, message }) => ({
            key,
            message: message.toUpperCase(),
          })),
        }),
      ),
  });

/** A model that always answers the same thing. */
const fixed = (...args: Parameters<typeof response>) =>
  new MockLanguageModelV4({ doGenerate: async () => response(...args) });

const REQUEST = {
  source: "en",
  target: "fr",
  messages: {
    greeting: { message: "Hello, {name}!", description: "Greets the user." },
    title: { message: "Welcome" },
  },
};

describe("translate", () => {
  it("resolves the translations by key", async () => {
    await expect(translate(REQUEST, { model: shout() })).resolves.toEqual({
      greeting: "HELLO, {NAME}!",
      title: "WELCOME",
    });
  });

  it("sends the locales, the messages and their descriptions", async () => {
    const model = shout();
    await translate(REQUEST, { model });
    expect(sent(model.doGenerateCalls[0]!)).toEqual({
      from: "en",
      to: "fr",
      messages: [
        {
          key: "greeting",
          message: "Hello, {name}!",
          description: "Greets the user.",
        },
        { key: "title", message: "Welcome" },
      ],
    });
  });

  it("runs under the base prompt and asks for a structured response", async () => {
    const model = shout();
    await translate(REQUEST, { model });
    const [call] = model.doGenerateCalls;
    expect(said(call!, "system")).toBe(PROMPT);
    expect(call?.responseFormat).toMatchObject({
      type: "json",
      schema: { required: ["translations"] },
    });
  });

  it("hands the SDK's own settings through, and applies its own", async () => {
    const model = shout();
    await translate(REQUEST, {
      model,
      temperature: 0.2,
      maxOutputTokens: 4000,
      providerOptions: { anthropic: { effort: "low" } },
      instructions: "Address the reader informally.",
    });
    const [call] = model.doGenerateCalls;
    expect(call?.temperature).toBe(0.2);
    expect(call?.maxOutputTokens).toBe(4000);
    expect(call?.providerOptions).toEqual({ anthropic: { effort: "low" } });
    expect(said(call!, "system")).toBe(
      system("Address the reader informally."),
    );
  });

  it("sends the messages in batches of the given size, in order", async () => {
    const model = shout();
    const messages = Object.fromEntries(
      ["a", "b", "c", "d", "e"].map((key) => [key, { message: key }]),
    );
    const translations = await translate(
      { source: "en", target: "fr", messages },
      { model, size: 2 },
    );
    expect(
      model.doGenerateCalls.map((call) =>
        sent(call).messages.map(({ key }) => key),
      ),
    ).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(Object.keys(translations)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("makes no request for no messages", async () => {
    const model = shout();
    await expect(
      translate({ source: "en", target: "fr", messages: {} }, { model }),
    ).resolves.toEqual({});
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("drops keys it did not ask for, and leaves skipped ones absent", async () => {
    const model = fixed(
      JSON.stringify({
        translations: [
          { key: "title", message: "Bienvenue" },
          { key: "invented", message: "?" },
        ],
      }),
    );
    await expect(translate(REQUEST, { model })).resolves.toEqual({
      title: "Bienvenue",
    });
  });

  it("throws when the model declines", async () => {
    const error = await translate(REQUEST, {
      model: fixed("", "content-filter"),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TranslationRefusedError);
    expect(error).toMatchObject({ keys: ["greeting", "title"] });
  });

  it("throws when a response runs out of tokens", async () => {
    const error = await translate(REQUEST, {
      model: fixed('{"translations":[{"key":"gree', "length"),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TranslationIncompleteError);
    expect(error).toMatchObject({ reason: "length" });
  });

  it("throws when the response is not the structure asked for", async () => {
    const error = await translate(REQUEST, {
      model: fixed('{"translations":"none"}'),
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TranslationIncompleteError);
    expect(error).toMatchObject({ reason: "not the structure asked for" });
  });

  it("lets the provider's own errors through", async () => {
    const failure = new Error("invalid api key");
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw failure;
      },
    });
    await expect(translate(REQUEST, { model, maxRetries: 0 })).rejects.toBe(
      failure,
    );
  });
});

describe("system", () => {
  it("is the base prompt when the project has no instructions", () => {
    expect(system(undefined)).toBe(PROMPT);
    expect(system("  \n")).toBe(PROMPT);
  });

  it("appends the project's instructions to the base prompt", () => {
    expect(system("Never translate “fibber”.")).toBe(
      `${PROMPT}\n\nInstructions specific to this project:\n\nNever translate “fibber”.`,
    );
  });
});
