export type SaveState<T> = { value: T; canUndo: boolean; status: "saved" | "pending" | "saving" | "error"; error: string | null };

/** Serial saves preserve edits made during a request; undo writes a new snapshot. */
export class Autosave<T> {
  private state: SaveState<T>;
  private saved: string;
  private history: T[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private lastAction = "";
  private lastEdit = 0;

  constructor(initial: T, private save: (value: T) => Promise<unknown>, private delay = 700) {
    this.state = { value: initial, canUndo: false, status: "saved", error: null };
    this.saved = JSON.stringify(initial);
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(patch: Partial<SaveState<T>>) {
    this.state = { ...this.state, ...patch, canUndo: this.history.length > 0 };
    this.listeners.forEach((fn) => fn());
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  edit = (next: T, action = "edit") => {
    if (JSON.stringify(next) === JSON.stringify(this.state.value)) return;
    if (action !== this.lastAction || Date.now() - this.lastEdit > 1200 || !this.history.length) {
      this.history.push(this.state.value);
    }
    this.lastAction = action;
    this.lastEdit = Date.now();
    this.publish({ value: next, status: "pending", error: null });
    this.schedule();
  };
  undo = () => {
    const previous = this.history.pop();
    if (previous === undefined) return;
    this.lastAction = "";
    this.publish({ value: previous, status: "pending", error: null });
    this.schedule();
  };
  flush = async (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.running) { await this.running; return; }
    if (JSON.stringify(this.state.value) === this.saved) { this.publish({ status: "saved", error: null }); return; }
    const snapshot = this.state.value;
    this.publish({ status: "saving", error: null });
    this.running = (async () => {
      try {
        await this.save(snapshot);
        this.saved = JSON.stringify(snapshot);
        this.publish({ status: JSON.stringify(this.state.value) === this.saved ? "saved" : "pending" });
      } catch (error) {
        this.publish({ status: "error", error: error instanceof Error ? error.message : "Save failed" });
      }
    })();
    await this.running;
    this.running = undefined;
    if (this.state.status === "pending") await this.flush();
  };
}