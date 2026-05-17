/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "../useMobile";

// happy-dom implements matchMedia but we control the state manually
// to test breakpoint logic without depending on implementation details.
function setupMatchMedia(innerWidth: number) {
  const listeners = new Map<string, Array<() => void>>();

  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: innerWidth });

  const mql = {
    matches: innerWidth < 768,
    media: "(max-width: 767px)",
    addEventListener: vi.fn((event: string, handler: () => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    }),
    removeEventListener: vi.fn((event: string, handler: () => void) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(event, arr.filter(h => h !== handler));
    }),
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

  // Helper to simulate a resize: update innerWidth and fire the 'change' listeners
  const resize = (newWidth: number) => {
    (window as { innerWidth: number }).innerWidth = newWidth;
    for (const handler of listeners.get("change") ?? []) handler();
  };

  return { mql, resize };
}

describe("useIsMobile", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when innerWidth is above the 768px breakpoint", () => {
    setupMatchMedia(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when innerWidth is below the 768px breakpoint", () => {
    setupMatchMedia(375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false at exactly 768px (breakpoint is exclusive: < 768)", () => {
    setupMatchMedia(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true at 767px (one pixel below breakpoint)", () => {
    setupMatchMedia(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates to true when viewport shrinks below breakpoint", () => {
    const { resize } = setupMatchMedia(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => resize(375));
    expect(result.current).toBe(true);
  });

  it("updates to false when viewport grows above breakpoint", () => {
    const { resize } = setupMatchMedia(375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    act(() => resize(1200));
    expect(result.current).toBe(false);
  });

  it("registers a change listener and removes it on unmount", () => {
    const { mql } = setupMatchMedia(1024);
    const { unmount } = renderHook(() => useIsMobile());
    expect(mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
