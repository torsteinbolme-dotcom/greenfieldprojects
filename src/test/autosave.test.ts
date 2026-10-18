import { afterEach, describe, expect, it, vi } from "vitest";
import { Autosave } from "@/lib/autosave";

afterEach(() => vi.useRealTimers());
describe("automatic saving and undo", () => {
  it("automatically saves after editing without a save action", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const editor = new Autosave({ price: 699 }, save);
    editor.edit({ price: 800 }, "price");
    await vi.advanceTimersByTimeAsync(700);
    expect(save).toHaveBeenCalledWith({ price: 800 });
    expect(editor.getSnapshot().status).toBe("saved");
  });
  it("undo restores and saves the previous value as another snapshot", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const editor = new Autosave({ price: 699 }, save);
    editor.edit({ price: 800 }, "price");
    await editor.flush();
    editor.undo();
    await editor.flush();
    expect(save.mock.calls.map(([value]) => value.price)).toEqual([800, 699]);
    expect(editor.getSnapshot().value.price).toBe(699);
  });
  it("does not lose newer edits or overlap save requests", async () => {
    let resolve: (() => void) | undefined;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; })).mockResolvedValue(undefined);
    const editor = new Autosave({ price: 699 }, save);
    editor.edit({ price: 800 });
    const flushing = editor.flush();
    editor.edit({ price: 900 });
    expect(save).toHaveBeenCalledTimes(1);
    resolve?.();
    await flushing;
    expect(save.mock.calls.map(([value]) => value.price)).toEqual([800, 900]);
    expect(editor.getSnapshot().value.price).toBe(900);
  });
  it("keeps a failed edit available for retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
    const editor = new Autosave<number>(699, save);
    editor.edit(800);
    await editor.flush();
    expect(editor.getSnapshot()).toMatchObject({ value: 800, status: "error" });
    await editor.flush();
    expect(editor.getSnapshot().status).toBe("saved");
  });
  it("keeps scenario undo and saving isolated", async () => {
    const saveBase = vi.fn().mockResolvedValue(undefined);
    const saveOther = vi.fn().mockResolvedValue(undefined);
    const base = new Autosave<number>(699, saveBase);
    const other = new Autosave<number>(800, saveOther);
    other.edit(900);
    await other.flush();
    other.undo();
    await other.flush();
    expect(base.getSnapshot().value).toBe(699);
    expect(saveBase).not.toHaveBeenCalled();
    expect(saveOther.mock.calls).toEqual([[900], [800]]);
  });
});