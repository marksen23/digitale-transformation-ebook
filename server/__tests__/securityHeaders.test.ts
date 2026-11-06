import { describe, expect, it } from "vitest";
import {
  analyticsOrigin,
  buildContentSecurityPolicy,
  staticCacheControl,
} from "../lib/securityHeaders.js";

describe("security headers", () => {
  it("nimmt die Analytics-Origin nur aus einer echten URL", () => {
    expect(analyticsOrigin(undefined)).toBeNull();
    expect(analyticsOrigin("%VITE_ANALYTICS_ENDPOINT%")).toBeNull();
    expect(analyticsOrigin("https://analytics.example/umami")).toBe("https://analytics.example");
  });

  it("erlaubt Schriften, Inline-Styles und — nur wenn gesetzt — Analytics", () => {
    const prev = process.env.VITE_ANALYTICS_ENDPOINT;
    delete process.env.VITE_ANALYTICS_ENDPOINT;
    const base = buildContentSecurityPolicy();
    expect(base).toContain("font-src 'self' data: https://fonts.gstatic.com https://fonts.cdnfonts.com");
    expect(base).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.cdnfonts.com");
    expect(base).toContain("frame-ancestors 'self'");
    expect(base).toContain("https://generativelanguage.googleapis.com");
    expect(base).not.toContain("analytics.example");

    process.env.VITE_ANALYTICS_ENDPOINT = "https://analytics.example";
    const withAnalytics = buildContentSecurityPolicy();
    expect(withAnalytics).toContain("script-src 'self' 'unsafe-inline' https://analytics.example");
    expect(withAnalytics).toContain(
      "connect-src 'self' https://generativelanguage.googleapis.com https://fonts.googleapis.com https://fonts.gstatic.com https://fonts.cdnfonts.com https://analytics.example",
    );

    if (prev === undefined) delete process.env.VITE_ANALYTICS_ENDPOINT;
    else process.env.VITE_ANALYTICS_ENDPOINT = prev;
  });

  it("cached gehashte Assets immutable und index.html nicht", () => {
    const root = "/app/dist/public";
    expect(staticCacheControl(root, "/app/dist/public/assets/index-abc123.js")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(staticCacheControl(root, "/app/dist/public/index.html")).toBe("no-cache");
    expect(staticCacheControl(root, "/app/dist/public/icons/favicon-32.png")).toBeNull();
  });
});
