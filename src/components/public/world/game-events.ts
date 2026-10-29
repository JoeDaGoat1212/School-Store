import { useSyncExternalStore } from "react";

/*
 * "Something in the game changed": the city game's plain-TypeScript modules
 * (money, robberies, jobs…) call notify(); the on-screen buttons that use
 * useGameVersion() re-draw.
 */

let version = 0;
const listeners = new Set<() => void>();

export function notify() {
  version++;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Re-draws whenever notify() is called. */
export function useGameVersion() {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
