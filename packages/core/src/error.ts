import type { Issue } from "@fibber/schema";

import { SchemaError } from "@fibber/schema";

/** A core error built from the issues of a failed schema assertion. */
type Framed = new (issues: Issue[]) => Error;

/**
 * Renders issues into a multi-line message, each prefixed by its path.
 */
const summarize = (issues: Issue[]): string =>
  issues
    .map((issue) =>
      issue.path?.length
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("\n");

/**
 * Raised when a locale is not one the contract declares — at construction,
 * or on `apply`. Carries the schema's issues.
 */
export class InvalidLocaleError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(`@fibber/core: the locale is invalid —\n${summarize(issues)}`);
    this.name = "InvalidLocaleError";
    this.issues = issues;
  }
}

/**
 * Raised when a bundle steps outside the contract — a key the contract does
 * not declare, or an entry that is not a compiled message. Carries the
 * schema's issues, one per offending entry.
 */
export class InvalidBundleError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(`@fibber/core: the bundle is invalid —\n${summarize(issues)}`);
    this.name = "InvalidBundleError";
    this.issues = issues;
  }
}

/**
 * Raised when a time zone is not an IANA zone the runtime knows — at
 * construction, or on `setTimeZone`. Carries the schema's issues.
 */
export class InvalidTimeZoneError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(`@fibber/core: the time zone is invalid —\n${summarize(issues)}`);
    this.name = "InvalidTimeZoneError";
    this.issues = issues;
  }
}

/**
 * Raised when a convention is not a well-formed locale tag — at
 * construction, or on `setConvention`. Carries the schema's issues.
 */
export class InvalidConventionError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(`@fibber/core: the convention is invalid —\n${summarize(issues)}`);
    this.name = "InvalidConventionError";
    this.issues = issues;
  }
}

/**
 * Raised when a helper is asked for a named format that is neither built in
 * nor declared by the contract. Carries the `kind` and the `format` name.
 */
export class UnknownFormatError extends Error {
  readonly kind: string;
  readonly format: string;

  constructor(kind: string, format: string) {
    super(
      `@fibber/core: ${JSON.stringify(format)} is not a ${kind} format of the contract`,
    );
    this.name = "UnknownFormatError";
    this.kind = kind;
    this.format = format;
  }
}

/**
 * Runs a schema assertion and rethrows its {@link SchemaError} as the given
 * core error, so callers catch by what they were doing rather than by which
 * check failed. Any other error propagates untouched.
 *
 * @param Frame - The core error to raise in the schema error's place.
 * @param run - The assertion.
 */
export const reframe = <R>(Frame: Framed, run: () => R): R => {
  try {
    return run();
  } catch (error) {
    if (error instanceof SchemaError) {
      throw new Frame(error.issues);
    }
    throw error;
  }
};
