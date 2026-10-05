/** What a batch is called in a message: its one key, or how many it holds. */
const subject = (keys: string[]): string => {
  return keys.length === 1
    ? JSON.stringify(keys[0])
    : `${keys.length} messages`;
};

/**
 * Raised when the model declines to translate a batch of messages or a
 * document — the provider's content filter stopped the response. Carries
 * the `keys` of the batch, or the document's path.
 */
export class TranslationRefusedError extends Error {
  readonly keys: string[];

  constructor(keys: string[], options?: ErrorOptions) {
    super(
      `@fibber/translate: the model declined to translate ${subject(keys)}`,
      options,
    );
    this.name = "TranslationRefusedError";
    this.keys = keys;
  }
}

/**
 * Raised when a response ends without a complete answer — it ran out of
 * tokens, or what came back was not the structure asked for. Carries the
 * `keys` of the batch and the `reason` the response stopped.
 */
export class TranslationIncompleteError extends Error {
  readonly keys: string[];
  readonly reason: string;

  constructor(keys: string[], reason: string, options?: ErrorOptions) {
    super(
      `@fibber/translate: the response for ${subject(keys)} was incomplete (${reason}) — lower \`size\` or raise \`maxOutputTokens\``,
      options,
    );
    this.name = "TranslationIncompleteError";
    this.keys = keys;
    this.reason = reason;
  }
}
