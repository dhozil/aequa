"use client";

import * as React from "react";

/**
 * Strict matchMedia hook for HeroFinancial. Returns false on the server and
 * during hydration, then syncs with the real query via a shared
 * MediaQueryList store.
 */
const mqlCache = new Map<string, MediaQueryList>();

function ensureStore(query: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  let mql = mqlCache.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mqlCache.set(query, mql);
  }
  return mql;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = ensureStore(query);
      if (!mql) return () => {};
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => ensureStore(query)?.matches ?? false,
    () => false,
  );
}

export default useMediaQuery;
