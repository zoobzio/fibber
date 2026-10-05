import type { Contract, Document } from "#build/fibber/index.mjs";
import type { Bundle, Config, Fibber, Locale, Resolver } from "fibber";

/**
 * The active contract: the `Contract` the build-time `index` module declares
 * over its locales, messages and formats.
 */
export type AppFibberContract = Contract;

/**
 * A locale the app is built for.
 */
export type AppFibberLocale = Locale<AppFibberContract>;

/**
 * A content document the app is built with, by its path.
 */
export type AppFibberDocument = Document;

/**
 * One locale's compiled messages.
 */
export type AppFibberBundle = Bundle<AppFibberContract>;

/**
 * The caller-owned state container the service operates on.
 */
export type AppFibberConfig = Config<AppFibberContract>;

/**
 * The runtime translation service bound to the app's contract.
 */
export type AppFibber = Fibber<AppFibberContract>;

/**
 * The app's messages as functions: what `$t` is.
 */
export type AppFibberResolver = Resolver<AppFibberContract>;

/**
 * What a visitor has chosen, and what travels from the server render to the
 * browser: the locale, and how values are formatted. The messages do not —
 * each side loads the locale's bundle itself.
 */
export interface AppFibberSelection {
  locale: AppFibberLocale;
  timeZone?: string | undefined;
  convention?: string | undefined;
}

/**
 * Switches the app to a locale: loads its bundle, then applies both in one
 * step. Of calls that overlap, the last one made wins.
 */
export type SetLocale = (locale: AppFibberLocale) => Promise<void>;

/**
 * The runtime hooks the service emits, keyed by event name. Shared between the
 * `#app` augmentation and {@link FibberNuxtApp} so the two never drift.
 */
export interface FibberHooks {
  "fibber:ready": (service: AppFibber) => void;
  "fibber:locale": (locale: AppFibberLocale) => void;
}

/**
 * The minimal `nuxtApp` surface the instrumentation needs. Typing against this
 * instead of `NuxtApp` keeps `makeFibber` off the `NuxtApp.$fibber` →
 * `AppFibber` → `makeFibber` cycle that otherwise makes the augmentation
 * recursive.
 */
export interface FibberNuxtApp {
  callHook<H extends keyof FibberHooks>(
    name: H,
    ...args: Parameters<FibberHooks[H]>
  ): unknown;
}

declare module "#app" {
  interface NuxtApp {
    $fibber: AppFibber;
    $t: AppFibberResolver;
    $setLocale: SetLocale;
  }

  // Declaration merging: fold the shared hook map into Nuxt's runtime hooks.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface RuntimeNuxtHooks extends FibberHooks {}
}
