import type { CallSettings, LanguageModel, generateText } from "ai";

/**
 * How a translation runs. Everything about execution is the AI SDK's own —
 * the model, the call settings, the provider options — so what the SDK and
 * its providers support is what a project can configure; `instructions` and
 * `size` are the only options of this package's making.
 */
export interface TranslateOptions extends CallSettings {
  /**
   * The model that translates: a model from any AI SDK provider
   * (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, …), or a
   * `provider/model` id resolved through the SDK's default provider.
   */
  model: LanguageModel;

  /**
   * Options passed through to the provider, by provider name — reasoning
   * effort, service tier, whatever the provider's own package documents.
   */
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];

  /**
   * The project's own guidance, added to the base prompt: a glossary, the
   * tone to take, who the audience is, terms never to translate.
   */
  instructions?: string;

  /**
   * How many messages one request carries. Smaller requests fail and retry
   * more cheaply; larger ones give the model more context. Defaults to 50.
   * A document always goes out whole.
   */
  size?: number;
}

/** One message to translate. */
export interface Source {
  /** The ICU message in the source locale. */
  message: string;

  /** What the message is for, when its author said. */
  description?: string;
}

/** A set of messages to take from one locale to another. */
export interface TranslateRequest {
  /** The locale the messages are written in. */
  source: string;

  /** The locale to translate them to. */
  target: string;

  /** The messages, by key. */
  messages: Record<string, Source>;
}

/**
 * Translates a set of messages. Resolves the translations by key: a key the
 * model did not answer for is absent, and the caller decides what a
 * translation is worth — whether it parses, whether it fits its source.
 */
export type Translate = (
  request: TranslateRequest,
  options: TranslateOptions,
) => Promise<Record<string, string>>;

/** One Markdown document to take from one locale to another. */
export interface DocumentRequest {
  /** The locale the document is written in. */
  source: string;

  /** The locale to translate it to. */
  target: string;

  /** The document's path, to name it in errors. */
  path: string;

  /** The Markdown document in the source locale, as it stands now. */
  document: string;

  /**
   * The translation the target locale already has, made from an earlier
   * version of the source. Given, the translation is brought up to date
   * rather than redone: wording that still holds is kept.
   */
  previous?: string;
}

/**
 * Translates one Markdown document, or updates its existing translation.
 * The caller decides what the result is worth — whether its structure
 * survived.
 */
export type TranslateDocument = (
  request: DocumentRequest,
  options: TranslateOptions,
) => Promise<string>;
