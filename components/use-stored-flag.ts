"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Same-tab writes don't fire `storage`, so flips are broadcast here too. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * A boolean view preference remembered in `localStorage`. The server render
 * and first paint use `fallback`, so hydration never mismatches.
 */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const read = useCallback(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? fallback : stored === "1";
    } catch {
      return fallback;
    }
  }, [key, fallback]);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Private mode or a full quota: the toggle just won't be remembered.
      }
      for (const listener of listeners) listener();
    },
    [key],
  );

  return [value, set];
}
