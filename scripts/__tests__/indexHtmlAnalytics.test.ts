import { describe, expect, it } from "vitest";
import { umamiScript } from "../../vite/indexHtmlAnalytics.js";

describe("umamiScript", () => {
  it("lässt das Script weg, wenn eine Variable fehlt", () => {
    expect(umamiScript(undefined, undefined)).toBeNull();
    expect(umamiScript("", "site")).toBeNull();
    expect(umamiScript("https://analytics.example", "")).toBeNull();
    expect(umamiScript("%VITE_ANALYTICS_ENDPOINT%", "%VITE_ANALYTICS_WEBSITE_ID%")).toBeNull();
  });

  it("baut die Umami-URL nur aus beiden gesetzten Werten", () => {
    expect(umamiScript("https://analytics.example/", " web-1 ")).toEqual({
      src: "https://analytics.example/umami",
      websiteId: "web-1",
    });
  });

  it("lehnt Werte ab, die das Script-Tag aufbrechen würden", () => {
    expect(umamiScript("https://analytics.example", 'id"onload="alert(1)')).toBeNull();
    expect(umamiScript("javascript:alert(1)", "web-1")).toBeNull();
  });
});
