// Typecheck-only stub for the Nuxt `#imports` virtual module.
import type { Ref, ComputedRef } from "vue";

export declare function useState<T>(key: string, init: () => T): Ref<T>;

export declare function useCookie<T>(key: string): Ref<T | null>;

export declare function useRequestHeaders(
  include: string[],
): Record<string, string | undefined>;

export declare function useHead(input: {
  htmlAttrs?: Record<string, ComputedRef<string>>;
}): void;

export declare function useAsyncData<T>(
  key: string,
  handler: () => Promise<T>,
  options?: { watch?: Array<() => unknown> },
): Promise<{ data: Ref<T | undefined> }> & { data: Ref<T | undefined> };

export declare function useRequestFetch(): <T>(
  url: string,
  options?: { responseType?: "text" | "json" },
) => Promise<T>;
