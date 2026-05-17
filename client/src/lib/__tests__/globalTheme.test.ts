/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { syncGlobalTheme, toggleGlobalTheme, initCrossTabThemeSync } from "../globalTheme";

const STORAGE_KEY = "ebook-dark";

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function themeColorContent(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null;
}

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  // Remove any theme-color meta tags left from previous tests
  document.querySelectorAll('meta[name="theme-color"]').forEach(el => el.remove());
});

// ─── syncGlobalTheme ─────────────────────────────────────────────────────────

describe("syncGlobalTheme", () => {
  it("does nothing when no value is stored", () => {
    syncGlobalTheme();
    expect(isDark()).toBe(false);
  });

  it("adds dark class when stored value is true", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    syncGlobalTheme();
    expect(isDark()).toBe(true);
  });

  it("removes dark class when stored value is false", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem(STORAGE_KEY, "false");
    syncGlobalTheme();
    expect(isDark()).toBe(false);
  });

  it("sets PWA theme-color meta to dark color when dark", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    syncGlobalTheme();
    const color = themeColorContent();
    expect(color).toBeTruthy();
    expect(color).not.toBe("#fafaf9"); // light color
  });

  it("sets PWA theme-color meta to light color when light", () => {
    localStorage.setItem(STORAGE_KEY, "false");
    syncGlobalTheme();
    const color = themeColorContent();
    expect(color).toBe("#fafaf9");
  });

  it("creates the theme-color meta tag if it doesn't exist", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
    syncGlobalTheme();
    expect(document.querySelector('meta[name="theme-color"]')).not.toBeNull();
  });
});

// ─── toggleGlobalTheme ───────────────────────────────────────────────────────

describe("toggleGlobalTheme", () => {
  it("adds dark class when no dark class is present and returns true", () => {
    const result = toggleGlobalTheme();
    expect(result).toBe(true);
    expect(isDark()).toBe(true);
  });

  it("removes dark class when dark class is present and returns false", () => {
    document.documentElement.classList.add("dark");
    const result = toggleGlobalTheme();
    expect(result).toBe(false);
    expect(isDark()).toBe(false);
  });

  it("persists the new state to localStorage", () => {
    toggleGlobalTheme(); // light → dark
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
    toggleGlobalTheme(); // dark → light
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("updates the PWA theme-color meta tag on toggle", () => {
    toggleGlobalTheme(); // → dark
    const dark = themeColorContent();
    toggleGlobalTheme(); // → light
    const light = themeColorContent();
    expect(dark).not.toBe(light);
    expect(light).toBe("#fafaf9");
  });
});

// ─── initCrossTabThemeSync ────────────────────────────────────────────────────

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

  it("adds dark class when storage event fires with value true", () => {
    teardown = initCrossTabThemeSync();
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: "true" }),
    );
    expect(isDark()).toBe(true);
  });

  it("removes dark class when storage event fires with value false", () => {
    document.documentElement.classList.add("dark");
    teardown = initCrossTabThemeSync();
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: "false" }),
    );
    expect(isDark()).toBe(false);
  });

  it("ignores storage events for other keys", () => {
    teardown = initCrossTabThemeSync();
    window.dispatchEvent(
      new StorageEvent("storage", { key: "some-other-key", newValue: "true" }),
    );
    expect(isDark()).toBe(false);
  });

  it("ignores storage events where newValue is null (key deleted)", () => {
    teardown = initCrossTabThemeSync();
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: null }),
    );
    expect(isDark()).toBe(false);
  });

  it("stops responding after cleanup is called", () => {
    const cleanup = initCrossTabThemeSync();
    cleanup();
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: "true" }),
    );
    expect(isDark()).toBe(false); // handler was removed, no change
  });
});
