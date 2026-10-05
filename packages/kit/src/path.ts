import { posix, win32 } from "node:path";

/**
 * Normalizes an authored relative path to posix form — separators unified,
 * `./` segments and a trailing slash dropped.
 *
 * @param path - The authored path.
 */
export const normalize = (path: string): string => {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/\/$/, "");
};

/**
 * Whether a normalized path stays strictly inside the directory it is relative
 * to: not absolute, not the directory itself, and not reaching a parent. The
 * gate on everywhere the kit writes or removes files.
 *
 * @param path - A path already through {@link normalize}.
 */
export const inside = (path: string): boolean => {
  if (posix.isAbsolute(path) || win32.isAbsolute(path)) {
    return false;
  }
  return path !== "." && path !== ".." && !path.startsWith("../");
};
