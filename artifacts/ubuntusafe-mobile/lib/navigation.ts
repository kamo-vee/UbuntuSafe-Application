import type { Href, useRouter } from "expo-router";

/** Direct links, reloads and replaced screens may have no navigation history. */
export function goBackOrReplace(
  router: Pick<ReturnType<typeof useRouter>, "canGoBack" | "back" | "replace">,
  fallback: Href,
): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
