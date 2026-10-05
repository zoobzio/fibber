import type { KitConfig } from "./types";

/**
 * Identity helper that types a `fibber.config.ts`.
 *
 * @param config - The kit config.
 * @returns The same config.
 */
export const defineConfig = (config: KitConfig): KitConfig => config;
