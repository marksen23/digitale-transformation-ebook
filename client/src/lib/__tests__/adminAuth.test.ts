/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getStoredToken, checkAdminToken, callAdminAction, ADMIN_TOKEN_KEY } from "../adminAuth";

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  // Reset URL to a plain path with no query string
  window.history.replaceState({}, "", "/");
});

// ─── getStoredToken ───────────────────────────────────────────────────────────

describe("getStoredToken", () => {
  it("returns null when localStorage is empty and no URL token", () => {
    expect(getStoredToken()).toBeNull();
  });

  it("returns token stored in localStorage", () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "my-secret");
    expect(getStoredToken()).toBe("my-secret");
  });

  it("reads token from ?token= URL param, stores it, and returns it", () => {
    window.history.replaceState({}, "", "/?token=urltoken123");
    const result = getStoredToken();
    expect(result).toBe("urltoken123");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("urltoken123");
  });

  it("removes the token param from the URL after extracting it", () => {
    window.history.replaceState({}, "", "/?token=urltoken123");
    getStoredToken();
    expect(window.location.search).not.toContain("token");
  });

  it("preserves other query params when removing token", () => {
    window.history.replaceState({}, "", "/?foo=bar&token=secret&baz=qux");
    getStoredToken();
    expect(window.location.search).toContain("foo=bar");
    expect(window.location.search).toContain("baz=qux");
    expect(window.location.search).not.toContain("token");
  });

  it("URL token takes precedence over localStorage token", () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "old-token");
    window.history.replaceState({}, "", "/?token=new-token");
    expect(getStoredToken()).toBe("new-token");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("new-token");
  });
});

// ─── checkAdminToken ─────────────────────────────────────────────────────────

describe("checkAdminToken", () => {
  it("returns ok:true when server responds with { ok: true }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    }));
    const result = await checkAdminToken("valid-token");
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with error when server responds with { ok: false }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, error: "ungültiger Token" }),
    }));
    const result = await checkAdminToken("bad-token");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ungültiger Token");
  });

  it("returns ok:false when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));
    const result = await checkAdminToken("token");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("network failure");
  });

  it("sends the token as a Bearer header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", mockFetch);
    await checkAdminToken("my-token");
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-token");
  });
});

// ─── callAdminAction ─────────────────────────────────────────────────────────

describe("callAdminAction", () => {
  it("returns ok:false with 'Token fehlt' when localStorage has no token", async () => {
    const result = await callAdminAction("curate", {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token fehlt");
  });

  it("returns ok:true when server responds with 200", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "token123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    const result = await callAdminAction("curate", { id: "abc" });
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with error when server responds with non-ok status", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "token123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    }));
    const result = await callAdminAction("delete", { id: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden");
  });

  it("falls back to HTTP status string when error body has no error field", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "token123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    const result = await callAdminAction("curate", {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("500");
  });

  it("returns ok:false when fetch throws", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "token123");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const result = await callAdminAction("curate", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timeout");
  });

  it("calls the correct endpoint URL for 'curate'", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "tok");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    await callAdminAction("curate", {});
    expect(mockFetch.mock.calls[0][0]).toContain("/api/admin/curate");
  });

  it("calls the correct endpoint URL for 'delete'", async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "tok");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    await callAdminAction("delete", {});
    expect(mockFetch.mock.calls[0][0]).toContain("/api/admin/delete");
  });
});
