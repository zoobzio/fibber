import type { Issue } from "./types";

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
 * Raised when an assertion rejects a value. Carries the concrete
 * {@link Issue}s — each with its own message and path — rather than
 * collapsing them into a single string, so callers can react to every failure
 * individually.
 */
export class SchemaError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(summarize(issues));
    this.name = "SchemaError";
    this.issues = issues;
  }
}
