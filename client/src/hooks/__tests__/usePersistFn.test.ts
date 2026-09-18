/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistFn } from "../usePersistFn.js";

describe("usePersistFn", () => {
  it("returns a stable function reference across re-renders", () => {
    let count = 0;
    const { result, rerender } = renderHook(() => usePersistFn(() => count));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("calls the latest version of the function", () => {
    let value = 1;
    const { result, rerender } = renderHook(() => usePersistFn(() => value));
    const persisted = result.current;
    value = 42;
    rerender();
    expect(persisted()).toBe(42);
  });

  it("passes arguments through correctly", () => {
    const { result } = renderHook(() => usePersistFn((a: number, b: number) => a + b));
    expect(result.current(3, 4)).toBe(7);
  });

  it("preserves this context", () => {
    const obj = { name: "test" };
    const { result } = renderHook(() =>
      usePersistFn(function (this: typeof obj) { return this.name; })
    );
    expect(result.current.call(obj)).toBe("test");
  });
});
