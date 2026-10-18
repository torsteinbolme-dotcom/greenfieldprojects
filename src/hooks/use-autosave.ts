import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Autosave } from "@/lib/autosave";

export function useAutosave<T>(scope: string, initial: T | null, save: (value: T) => Promise<unknown>) {
  const ready = initial !== null;
  // A new saved version must not replace the current draft or its undo stack.
  const controller = useMemo(() => initial === null ? null : new Autosave(initial, save), [scope, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useSyncExternalStore(controller?.subscribe ?? subscribeEmpty, controller?.getSnapshot ?? emptySnapshot, controller?.getSnapshot ?? emptySnapshot);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (controller && controller.getSnapshot().status !== "saved") { event.preventDefault(); void controller.flush(); }
    };
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("beforeunload", unload); void controller?.flush(); };
  }, [controller]);
  return { controller, state };
}
const subscribeEmpty = () => () => {};
const emptySnapshot = () => null;