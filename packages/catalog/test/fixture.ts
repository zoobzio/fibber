import { defineSchema } from "@fibber/schema";

/** A contract as the kit emits it. */
export const contract = {
  locale: "en",
  locales: ["en", "fr"],
  messages: ["greeting", "title"],
} as const;

export const schema = defineSchema(contract);

/** A bundle per locale, compiled the way the kit emits them. */
export const bundles = {
  en: { title: [{ type: 0, value: "Welcome" }] },
  fr: { title: [{ type: 0, value: "Bienvenue" }] },
};

export const entries = [
  { id: "en", name: "English" },
  { id: "fr", name: "français" },
];
