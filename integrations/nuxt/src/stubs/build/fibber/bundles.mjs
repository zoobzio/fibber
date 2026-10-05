// Runtime stub for the generated `#build/fibber/bundles.mjs` virtual module:
// each locale's bundle, compiled the way `@fibber/kit` emits them.
const text = (value) => [{ type: 0, value }];

const plural = (one, other) => [
  {
    type: 6,
    value: "count",
    options: {
      one: { value: [{ type: 7 }, { type: 0, value: one }] },
      other: { value: [{ type: 7 }, { type: 0, value: other }] },
    },
    offset: 0,
    pluralType: "cardinal",
  },
];

const seen = (before, between) => [
  { type: 0, value: before },
  { type: 3, value: "at", style: "medium" },
  { type: 0, value: between },
  { type: 4, value: "at", style: "short" },
];

const en = {
  greeting: [
    { type: 0, value: "Hello, " },
    { type: 1, value: "name" },
    { type: 0, value: "!" },
  ],
  title: text("Welcome"),
  inbox: plural(" new message", " new messages"),
  seen: seen("Seen ", " at "),
};

const fr = {
  greeting: [
    { type: 0, value: "Bonjour, " },
    { type: 1, value: "name" },
    { type: 0, value: " !" },
  ],
  title: text("Bienvenue"),
  inbox: plural(" nouveau message", " nouveaux messages"),
  seen: seen("Vu le ", " à "),
};

export const bundles = Object.freeze({
  en: async () => en,
  fr: async () => fr,
  "pt-BR": async () => ({ ...en, title: text("Bem-vindo") }),
});
