"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during server render and hydration, true afterwards. Use it before
 * rendering cached client data inside a Suspense boundary, where the cache can
 * fill before that boundary hydrates.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
