import { record } from "objectively";

import type { Bundle, Definition, Issue, Key, Locale, Schema } from "./types";
import { SchemaError } from "./error";

/**
 * Whether a value has the shape of a compiled message: an array of elements,
 * each a record carrying a numeric `type`. A shape test — the kit is what
 * proves a message compiles and fits its source.
 */
const isAst = (value: unknown): boolean => {
  return (
    Array.isArray(value) &&
    value.every(
      (element) => record(element) && typeof element.type === "number",
    )
  );
};

/**
 * Derives the validation bundle for a contract — what proves a locale, a
 * message key, or a bundle that arrives at runtime (fetched, imported,
 * restored from storage) before the service adopts it.
 *
 * A bundle may hold any part of the contract's messages, but nothing outside
 * it: every key must be a message the contract declares, mapped to a compiled
 * message.
 *
 * A time zone and a convention — the locale values are formatted by — are
 * proven against the runtime rather than the contract: any IANA zone, any
 * well-formed locale tag.
 *
 * @param definition - The contract `@fibber/kit` built.
 * @returns The {@link Schema} for the contract.
 */
export const defineSchema = <D extends Definition>(
  definition: D,
): Schema<D> => {
  const locales = new Set<unknown>(definition.locales);
  const messages = new Set<unknown>(definition.messages);

  const inspect = {
    locale: (value: unknown): Issue[] => {
      if (locales.has(value)) {
        return [];
      }
      return [
        { message: `${JSON.stringify(value)} is not a locale of the contract` },
      ];
    },
    key: (value: unknown): Issue[] => {
      if (messages.has(value)) {
        return [];
      }
      return [
        {
          message: `${JSON.stringify(value)} is not a message of the contract`,
        },
      ];
    },
    bundle: (value: unknown): Issue[] => {
      if (!record(value)) {
        return [{ message: "a bundle must be a record of compiled messages" }];
      }
      const issues: Issue[] = [];
      for (const [key, ast] of Object.entries(value)) {
        if (!messages.has(key)) {
          issues.push({
            message: "is not a message of the contract",
            path: [key],
          });
        } else if (!isAst(ast)) {
          issues.push({ message: "is not a compiled message", path: [key] });
        }
      }
      return issues;
    },
  };

  const settings = {
    timeZone: (value: unknown): Issue[] => {
      try {
        if (typeof value === "string") {
          new Intl.DateTimeFormat(undefined, { timeZone: value });
          return [];
        }
      } catch {
        // Not a zone the runtime knows: reported below.
      }
      return [{ message: `${JSON.stringify(value)} is not an IANA time zone` }];
    },
    convention: (value: unknown): Issue[] => {
      try {
        if (typeof value === "string" && value !== "") {
          Intl.getCanonicalLocales(value);
          return [];
        }
      } catch {
        // Not a well-formed tag: reported below.
      }
      return [
        { message: `${JSON.stringify(value)} is not a BCP 47 locale tag` },
      ];
    },
  };

  const assert = (issues: Issue[]): void => {
    if (issues.length > 0) {
      throw new SchemaError(issues);
    }
  };

  return {
    definition,
    check: {
      locale: (value): value is Locale<D> => inspect.locale(value).length === 0,
      key: (value): value is Key<D> => inspect.key(value).length === 0,
      bundle: (value): value is Bundle<D> => inspect.bundle(value).length === 0,
      timeZone: (value): value is string =>
        settings.timeZone(value).length === 0,
      convention: (value): value is string =>
        settings.convention(value).length === 0,
    },
    assert: {
      locale: (value) => assert(inspect.locale(value)),
      key: (value) => assert(inspect.key(value)),
      bundle: (value) => assert(inspect.bundle(value)),
      timeZone: (value) => assert(settings.timeZone(value)),
      convention: (value) => assert(settings.convention(value)),
    },
  };
};
