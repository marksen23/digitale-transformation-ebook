/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEbookTheme } from "../useEbookTheme";

describe("useEbookTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("returns false initially when <html> has no dark class", () => {
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(false);
  });

  it("returns true when <html> already has the dark class on mount", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(true);
  });

  it("updates to true when dark class is added after mount", async () => {
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(false);

    await act(async () => {
      document.documentElement.classList.add("dark");
      // MutationObserver fires asynchronously; yield a microtask
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
  });

  it("updates back to false when dark class is removed", async () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(true);

    await act(async () => {
      document.documentElement.classList.remove("dark");
      await Promise.resolve();
    });

    expect(result.current).toBe(false);
  });

  it("disconnects the observer on unmount (no memory leak)", () => {
    const observed: MutationObserver[] = [];
    const OrigObserver = globalThis.MutationObserver;
    class TrackingObserver extends OrigObserver {
      constructor(cb: MutationCallback) {
        super(cb);
        observed.push(this);
      }
    }
    globalThis.MutationObserver = TrackingObserver as typeof MutationObserver;

    const { unmount } = renderHook(() => useEbookTheme());
    expect(observed).toHaveLength(1);

    // After unmount the observer should no longer fire
    const disconnectSpy = vi.spyOn(observed[0], "disconnect");
    unmount();
    expect(disconnectSpy).toHaveBeenCalled();

    globalThis.MutationObserver = OrigObserver;
  });
});
