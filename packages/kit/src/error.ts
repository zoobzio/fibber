/**
 * Raised when there is no config file at the path the build was pointed at.
 * Carries the `path` it looked for.
 */
export class MissingConfigError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`@fibber/kit: no config file at ${path}`);
    this.name = "MissingConfigError";
    this.path = path;
  }
}

/**
 * Raised when a config file does not default-export a config — the file
 * loaded, but what it exports is not config-shaped. Carries the `path` of the
 * file.
 */
export class MalformedConfigError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(
      `@fibber/kit: ${path} must default-export a config (defineConfig({ source, locale }))`,
    );
    this.name = "MalformedConfigError";
    this.path = path;
  }
}

/**
 * Raised when a config breaks the kit's rules — a locale that is not a
 * canonical tag, a target listed twice, an output directory outside the
 * project root. Carries every issue found, not just the first, and is thrown
 * before any document is read.
 */
export class InvalidConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const lines = issues.map((issue) => `  ${issue}`).join("\n");
    super(`@fibber/kit: the config is invalid —\n${lines}`);
    this.name = "InvalidConfigError";
    this.issues = issues;
  }
}

/**
 * Raised when a document the build reads is missing, is not JSON, or is not
 * the shape the kit expects of it. Carries the `path` of the document.
 */
export class InvalidDocumentError extends Error {
  readonly path: string;

  constructor(path: string, reason: string, options?: ErrorOptions) {
    super(`@fibber/kit: ${path} ${reason}`, options);
    this.name = "InvalidDocumentError";
    this.path = path;
  }
}

/**
 * Raised when a run has to translate and `@fibber/translate` cannot be
 * loaded. The kit only builds on its own: the package that calls a model is
 * an optional peer, installed by the projects that translate. Carries what
 * the import failed with as its `cause`.
 */
export class MissingTranslatorError extends Error {
  constructor(options?: ErrorOptions) {
    super(
      "@fibber/kit: translating needs @fibber/translate, which could not be loaded — add it to your devDependencies",
      options,
    );
    this.name = "MissingTranslatorError";
  }
}

/**
 * Raised when messages break the contract — a message that is not valid ICU
 * MessageFormat, an argument used as two incompatible kinds, a translation
 * that takes an argument its source does not. Carries every issue found
 * across the source and every locale, not just the first.
 */
export class InvalidMessagesError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const lines = issues.map((issue) => `  ${issue}`).join("\n");
    super(`@fibber/kit: the messages are invalid —\n${lines}`);
    this.name = "InvalidMessagesError";
    this.issues = issues;
  }
}
