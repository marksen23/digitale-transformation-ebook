/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { syncGlobalTheme, toggleGlobalTheme, initCrossTabThemeSync } from "../globalTheme.js";

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("syncGlobalTheme", () => {
  it("adds dark class when localStorage is true", () => {
    localStorage.setItem("ebook-dark", "true");
    syncGlobalTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class when localStorage is false", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("ebook-dark", "false");
    syncGlobalTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("does nothing to dark class when localStorage is empty", () => {
    document.documentElement.classList.add("dark");
    syncGlobalTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("sets theme-color meta when dark", () => {
    localStorage.setItem("ebook-dark", "true");
    syncGlobalTheme();
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe("#0c0a09");
  });

  it("sets theme-color meta when light", () => {
    localStorage.setItem("ebook-dark", "false");
    syncGlobalTheme();
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe("#fafaf9");
  });
});

describe("toggleGlobalTheme", () => {
  it("toggles from light to dark", () => {
    const next = toggleGlobalTheme();
    expect(next).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggles from dark to light", () => {
    document.documentElement.classList.add("dark");
    const next = toggleGlobalTheme();
    expect(next).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists the result in localStorage", () => {
    toggleGlobalTheme();
    expect(localStorage.getItem("ebook-dark")).toBe("true");
    toggleGlobalTheme();
    expect(localStorage.getItem("ebook-dark")).toBe("false");
  });

  it("double toggle returns to original state", () => {
    const start = document.documentElement.classList.contains("dark");
    toggleGlobalTheme();
    toggleGlobalTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(start);
  });
});

describe("initCrossTabThemeSync", () => {
  let teardown: (() => void) | null = null;
  afterEach(() => {
    teardown?.();
    teardown = null;
  });

  it("returns a cleanup function", () => {
    teardown = initCrossTabThemeSync();
    expect(typeof teardown).toBe("function");
  });

  it("adds dark class on storage event with true", () => {
    teardown = initCrossTabThemeSync();
    window.dispatchEvent(new StorageEvent("storage", {
      key: "ebook-dark",
      newValue: "true",
    }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class on storage event with false", () => {
    document.documentElement.classList.add("dark");
    teardown = initCrossTabThemeSync();
    window.dispatchEvent(new StorageEvent("storage", {
      key: "ebook-dark",
      newValue: "false",
    }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores storage events for different keys", () => {
    document.documentElement.classList.add("dark");
    teardown = initCrossTabThemeSync();
    window.dispatchEvent(new StorageEvent("storage", {
      key: "other-key",
      newValue: "false",
    }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("stops responding after cleanup", () => {
    teardown = initCrossTabThemeSync();
    teardown();
    teardown = null;
    window.dispatchEvent(new StorageEvent("storage", {
      key: "ebook-dark",
      newValue: "true",
    }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
