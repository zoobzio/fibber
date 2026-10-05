import { describe, expect, it } from "vitest";

import { compile, declared, fit } from "../src/compile";

/** Compiles a message that must compile, and returns its arguments. */
const args = (message: string) => {
  const compiled = compile(message);
  if (!compiled.ok) {
    throw new Error(compiled.issues.join("; "));
  }
  return compiled.value.arguments;
};

describe("compile", () => {
  it("reads no arguments off plain text", () => {
    expect(args("Welcome")).toEqual({});
  });

  it("reads each argument's kind off how the message uses it", () => {
    expect(
      args(
        "{name} has {n, plural, one {# item} other {# items}} worth {total, number, ::currency/USD} since {at, date, short} {at, time, short}",
      ),
    ).toEqual({
      name: { kind: "value" },
      n: { kind: "number" },
      total: { kind: "number" },
      at: { kind: "date" },
    });
  });

  it("reads ordinals as numbers", () => {
    expect(
      args("{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}"),
    ).toEqual({ place: { kind: "number" } });
  });

  it("reads a select's options and the arguments nested in them", () => {
    expect(
      args("{kind, select, a {{x} of a} b {<b>{y}</b>} other {none}}"),
    ).toEqual({
      kind: { kind: "select", options: ["a", "b", "other"] },
      x: { kind: "value" },
      b: { kind: "tag" },
      y: { kind: "value" },
    });
  });

  it("lets a formatted use win over a plain interpolation", () => {
    expect(args("{n} — {n, number}")).toEqual({ n: { kind: "number" } });
    expect(args("{n, number} — {n}")).toEqual({ n: { kind: "number" } });
  });

  it("pools the options of two selects on one argument", () => {
    expect(
      args("{k, select, a {1} other {2}} {k, select, b {3} other {4}}"),
    ).toEqual({ k: { kind: "select", options: ["a", "other", "b"] } });
  });

  it("resolves skeletons to Intl options and captures no locations", () => {
    const compiled = compile("{n, number, ::compact-short}");
    expect(compiled).toEqual({
      ok: true,
      value: {
        arguments: { n: { kind: "number" } },
        formats: { number: [], date: [], time: [] },
        ast: [
          {
            type: 2,
            value: "n",
            style: expect.objectContaining({
              parsedOptions: { notation: "compact", compactDisplay: "short" },
            }),
          },
        ],
      },
    });
  });

  it("reads the named formats a message refers to, skeletons aside", () => {
    const compiled = compile(
      "{a, number, price} {b, number, price} {c, number, ::percent} {d, date, long} {e, time, short} {f, select, x {{g, number, integer}} other {}}",
    );
    expect(compiled.ok && compiled.value.formats).toEqual({
      number: ["price", "integer"],
      date: ["long"],
      time: ["short"],
    });
  });

  it("reports a syntax error with where it stopped", () => {
    expect(compile("Hello {name")).toEqual({
      ok: false,
      issues: [
        "is not valid ICU MessageFormat (EXPECT_ARGUMENT_CLOSING_BRACE at 1:7)",
      ],
    });
  });

  it("rejects a select without an other clause", () => {
    const compiled = compile("{k, select, a {1}}");
    expect(compiled.ok).toBe(false);
  });

  it("reports an argument used as two incompatible kinds", () => {
    expect(compile("{at, date} {at, number}")).toEqual({
      ok: false,
      issues: ['argument "at" is used as both date and number'],
    });
  });

  it("is not fooled by an argument named like an Object member", () => {
    expect(args("{toString} {constructor, number}")).toEqual({
      toString: { kind: "value" },
      constructor: { kind: "number" },
    });
  });
});

describe("fit", () => {
  const source = args("{name} {n, plural, one {#} other {#}} <b>x</b>");

  it("accepts a translation that uses the same arguments", () => {
    expect(fit(source, args("<b>{name}</b> {n, plural, other {#}}"))).toEqual(
      [],
    );
  });

  it("accepts a translation that uses fewer, or interpolates plainly", () => {
    expect(fit(source, args("{n}"))).toEqual([]);
  });

  it("rejects an argument the source does not take", () => {
    expect(fit(source, args("{name} {extra}"))).toEqual([
      'takes "extra", which the source message does not',
    ]);
  });

  it("rejects an argument that needs more than the source asks for", () => {
    expect(fit(source, args("{name, number}"))).toEqual([
      'uses "name" as number, but the source message uses it as value',
    ]);
  });
});

describe("declared", () => {
  const known = {
    number: new Set(["integer", "price"]),
    date: new Set(["long"]),
    time: new Set<string>(),
  };

  it("accepts names that exist", () => {
    expect(
      declared({ number: ["price"], date: ["long"], time: [] }, known),
    ).toEqual([]);
  });

  it("reports each name with no format behind it, by kind", () => {
    expect(
      declared({ number: ["#,##0.00"], date: [], time: ["long"] }, known),
    ).toEqual([
      'uses the number format "#,##0.00", which is neither built in nor declared in the config\'s formats',
      'uses the time format "long", which is neither built in nor declared in the config\'s formats',
    ]);
  });
});
