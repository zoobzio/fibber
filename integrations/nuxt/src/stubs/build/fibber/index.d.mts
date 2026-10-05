// Typecheck-only stub for the generated `#build/fibber/index.mjs` virtual
// module, in the shape `@fibber/kit` emits for the stub messages.
export type Locale = "en" | "fr" | "pt-BR";
export type Document = "intro.md" | "guide/start.md";
export type Key = "greeting" | "title" | "inbox" | "seen";
export interface Arguments {
  greeting: { name: string | number };
  title: Record<never, never>;
  inbox: { count: number };
  seen: { at: Date | number };
}
export declare const contract: {
  readonly locale: "en";
  readonly locales: readonly Locale[];
  readonly messages: readonly Key[];
  readonly formats: {
    readonly number: Record<never, never>;
    readonly date: Record<never, never>;
    readonly time: Record<never, never>;
  };
  readonly arguments?: Arguments;
};
export type Contract = typeof contract;
