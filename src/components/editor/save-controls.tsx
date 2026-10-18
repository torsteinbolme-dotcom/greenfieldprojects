import { Undo2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/lib/autosave";

export function SaveControls({ state, undo, retry }: { state: SaveState<unknown>; undo: () => void; retry: () => void }) {
  return <div className="flex items-center gap-2">
    <Button size="icon" variant="outline" title="Undo last edit" aria-label="Undo last edit" disabled={!state.canUndo} onClick={undo}><Undo2 className="size-4" /></Button>
    <span role="status" className="text-xs text-muted-foreground">{state.status === "saved" ? "All changes saved" : state.status === "error" ? "Not saved" : "Saving…"}</span>
    {state.status === "error" && <Button size="icon" variant="outline" title={state.error ?? "Retry saving"} aria-label="Retry saving" onClick={retry}><RotateCw className="size-4" /></Button>}
  </div>;
}