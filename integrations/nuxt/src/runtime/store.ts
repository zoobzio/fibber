import type { AppFibberSelection } from "./types";

import { useCookie, useState } from "#imports";
import { contract } from "#build/fibber/index.mjs";
import {
  CONVENTION_COOKIE,
  LOCALE_COOKIE,
  TIME_ZONE_COOKIE,
} from "../constant";

/**
 * The per-request state and cookies the plugin and composables share. The
 * state is the visitor's selection only — the locale and how values are
 * formatted — so it is all the server render hands the browser; the messages
 * are loaded on each side and never serialized into the page.
 */
export const accessFibber = () => {
  const selection = useState<AppFibberSelection>("fibber:selection", () => ({
    locale: contract.locale,
  }));

  const locale = useCookie<string | null>(LOCALE_COOKIE);
  const timeZone = useCookie<string | null>(TIME_ZONE_COOKIE);
  const convention = useCookie<string | null>(CONVENTION_COOKIE);

  return {
    selection,
    cookies: { locale, timeZone, convention },
  };
};
