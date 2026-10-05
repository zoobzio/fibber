/**
 * The language subtag of a locale tag, lower-cased: `pt` of `pt-BR`.
 */
const language = (tag: string): string => {
  return (tag.split("-")[0] ?? tag).toLowerCase();
};

/**
 * Picks the locale an `Accept-Language` header asks for, from the ones the
 * app is built for. The header's tags are tried in the order the visitor
 * ranks them: an exact match first, then a locale in the same language
 * (`pt-PT` is served `pt-BR` before a lower-ranked language is tried).
 *
 * @param header - The `Accept-Language` header, if the request sent one.
 * @param locales - The locales the app is built for.
 * @returns The best match, or `undefined` when nothing the visitor asks for
 * is available.
 */
export const negotiate = <L extends string>(
  header: string | undefined,
  locales: readonly L[],
): L | undefined => {
  if (header === undefined) {
    return undefined;
  }
  const wanted = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const quality = params
        .map((param) => /^\s*q=([0-9.]+)\s*$/.exec(param)?.[1])
        .find((value) => value !== undefined);
      return {
        tag: tag.trim().toLowerCase(),
        quality: quality === undefined ? 1 : Number(quality),
      };
    })
    .filter(({ tag, quality }) => tag !== "" && tag !== "*" && quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of wanted) {
    const exact = locales.find((locale) => locale.toLowerCase() === tag);
    if (exact !== undefined) {
      return exact;
    }
    const related = locales.find(
      (locale) => language(locale) === language(tag),
    );
    if (related !== undefined) {
      return related;
    }
  }
  return undefined;
};
