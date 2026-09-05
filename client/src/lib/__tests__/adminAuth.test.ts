/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStoredToken, checkAdminToken, callAdminAction, ADMIN_TOKEN_KEY } from "../adminAuth.js";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("getStoredToken", () => {
  it("returns null when no token in localStorage or URL", () => {
    expect(getStoredToken()).toBeNull();
  });

  it("returns token from localStorage", () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "mein-token");
    expect(getStoredToken()).toBe("mein-token");
  });

  it("reads token from URL, saves to localStorage, and cleans URL", () => {
    Object.defineProperty(window, "location", {
      value: {
        search: "?token=url-token&other=val",
        pathname: "/admin",
        href: "http://localhost/admin?token=url-token&other=val",
      },
      writable: true,
    });
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const token = getStoredToken();
    expect(token).toBe("url-token");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("url-token");
    expect(replaceSpy).toHaveBeenCalledWith({}, "", "/admin?other=val");
  });
});

describe("checkAdminToken", () => {
  it("returns ok:true when server responds with ok:true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    }));
    const result = await checkAdminToken("valid-token");
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with error when server responds with ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, error: "Token ungültig" }),
    }));
    const result = await checkAdminToken("bad-token");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token ungültig");
  });

  it("returns ok:false when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await checkAdminToken("any-token");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
  });
});

describe("callAdminAction", () => {
  it("returns error when no token in localStorage", async () => {
    const result = await callAdminAction("curate", { id: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Token");
  });

  it("returns ok:true when server responds successfully", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }));
    const result = await callAdminAction("curate", { id: "abc" });
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with error from server on failure", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Nicht autorisiert" }),
    }));
    const result = await callAdminAction("curate", { id: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Nicht autorisiert");
  });

  it("returns ok:false when fetch throws", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "test-token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));
    const result = await callAdminAction("delete", { id: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Connection refused");
  });
});
