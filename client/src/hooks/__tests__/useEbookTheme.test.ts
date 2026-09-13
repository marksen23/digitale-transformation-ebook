/** @vitest-environment happy-dom */
import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEbookTheme } from "../useEbookTheme.js";

describe("useEbookTheme", () => {
  it("returns false when html has no dark class", () => {
    document.documentElement.classList.remove("dark");
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(false);
  });

  it("returns true when html has dark class initially", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(true);
    document.documentElement.classList.remove("dark");
  });

  it("updates when dark class is added", async () => {
    document.documentElement.classList.remove("dark");
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(false);

    act(() => {
      document.documentElement.classList.add("dark");
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    document.documentElement.classList.remove("dark");
  });

  it("updates when dark class is removed", async () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useEbookTheme());
    expect(result.current).toBe(true);

    act(() => {
      document.documentElement.classList.remove("dark");
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
