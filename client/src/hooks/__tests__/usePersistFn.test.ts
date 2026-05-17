/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePersistFn } from "../usePersistFn";

describe("usePersistFn", () => {
  it("returns a stable function reference across re-renders", () => {
    const fn = vi.fn();
    const { result, rerender } = renderHook(({ f }) => usePersistFn(f), {
      initialProps: { f: fn },
    });
    const first = result.current;
    rerender({ f: vi.fn() });
    expect(result.current).toBe(first);
  });

  it("always calls the latest version of the wrapped function", () => {
    let fn = vi.fn().mockReturnValue("v1");
    const { result, rerender } = renderHook(({ f }) => usePersistFn(f), {
      initialProps: { f: fn },
    });
    const persisted = result.current;
    expect(persisted()).toBe("v1");

    fn = vi.fn().mockReturnValue("v2");
    rerender({ f: fn });

    // Same reference, but now delegates to the new fn
    expect(result.current).toBe(persisted);
    expect(persisted()).toBe("v2");
  });

  it("passes arguments through to the wrapped function", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => usePersistFn(fn));
    result.current("a", 42, { x: true });
    expect(fn).toHaveBeenCalledWith("a", 42, { x: true });
  });

  it("preserves the return value of the wrapped function", () => {
    const fn = vi.fn().mockReturnValue(99);
    const { result } = renderHook(() => usePersistFn(fn));
    expect(result.current()).toBe(99);
  });

  it("preserves `this` context when called with .call()", () => {
    const context = { value: 42 };
    function fn(this: typeof context) {
      return this.value;
    }
    const { result } = renderHook(() => usePersistFn(fn));
    expect(result.current.call(context)).toBe(42);
  });
});
