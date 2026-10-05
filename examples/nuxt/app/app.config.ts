/**
 * The page's data. A message sits in it like any other field: an
 * `AppFibberMessage` is a key — alone, or with the values its message
 * takes — checked against the contract here, where it is written: a key
 * that does not exist, or values that are not its own, fail the typecheck.
 * The page resolves each one with `$t(message)`, in whatever locale is
 * active.
 */

/** A section of the page: its anchor, and its heading. */
interface Section {
  id: string;
  title: AppFibberMessage;
}

/** A plan: its name, and what it offers, line by line. */
interface Plan {
  id: string;
  name: AppFibberMessage;
  features: AppFibberMessage[];
}

const sections: Section[] = [
  { id: "messages", title: "section.messages" },
  { id: "helpers", title: "section.helpers" },
  { id: "plans", title: "section.plans" },
  { id: "content", title: "section.content" },
];

const plans: Plan[] = [
  {
    id: "solo",
    name: "plan.solo",
    features: [
      ["plan.seats", { count: 1 }],
      ["plan.price", { amount: 9 }],
    ],
  },
  {
    id: "team",
    name: "plan.team",
    features: [
      ["plan.seats", { count: 25 }],
      ["plan.price", { amount: 49 }],
    ],
  },
];

export default defineAppConfig({ sections, plans });
