// Typecheck-only stub for the Nuxt `#app` virtual module.

/**
 * Runtime hook signatures. Augmented by the Fibber runtime via
 * `declare module "#app"`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by the runtime
export interface RuntimeNuxtHooks {}

/**
 * The Nuxt app instance. The `$fibber` service is added by the Fibber
 * runtime via `declare module "#app"`.
 */
export interface NuxtApp {
  callHook: <K extends keyof RuntimeNuxtHooks>(
    name: K,
    ...args: Parameters<RuntimeNuxtHooks[K]>
  ) => Promise<void>;
  hook: <K extends keyof RuntimeNuxtHooks>(
    name: K,
    fn: RuntimeNuxtHooks[K],
  ) => void;
}

interface NuxtPluginDef {
  name: string;
  dependsOn?: string[];
  setup: (
    nuxtApp: NuxtApp,
  ) =>
    | void
    | { provide?: Record<string, unknown> }
    | Promise<void | { provide?: Record<string, unknown> }>;
}

export declare function defineNuxtPlugin(plugin: NuxtPluginDef): NuxtPluginDef;

export declare function useNuxtApp(): NuxtApp;
