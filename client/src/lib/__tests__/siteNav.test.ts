import { describe, expect, it } from "vitest";
import {
  SITE_NAV_CLUSTERS,
  navClustersFor,
  navItemsFor,
} from "@/lib/siteNav";

describe("siteNav", () => {
  it("lists Enkidu on both AppFrame and the mobile index", () => {
    const hrefs = (surface: "appFrame" | "mobileIndex") =>
      navItemsFor(surface).map(i => i.href);

    expect(hrefs("appFrame")).toContain("/enkidu");
    expect(hrefs("mobileIndex")).toContain("/enkidu");

    const enkidu = navItemsFor("mobileIndex").find(i => i.href === "/enkidu");
    expect(enkidu?.label).toBe("Enkidu");
    expect(enkidu?.mobileSub).toBe("BEGEGNUNG");
    expect(enkidu?.match.test("/enkidu")).toBe(true);
  });

  it("lists Hörfassung on both AppFrame and the mobile index", () => {
    const hrefs = (surface: "appFrame" | "mobileIndex") =>
      navItemsFor(surface).map(i => i.href);

    expect(hrefs("appFrame")).toContain("/hoeren");
    expect(hrefs("mobileIndex")).toContain("/hoeren");

    const hoeren = navItemsFor("mobileIndex").find(i => i.href === "/hoeren");
    expect(hoeren?.label).toBe("Hörfassung");
    expect(hoeren?.mobileSub).toBe("STIMME");
    expect(hoeren?.match.test("/hoeren")).toBe(true);
  });

  it("keeps Status on the mobile index only, not in the AppFrame clusters", () => {
    expect(navItemsFor("mobileIndex").map(i => i.href)).toContain("/status");
    expect(navItemsFor("appFrame").map(i => i.href)).not.toContain("/status");
  });

  it("does not drop AppFrame entries from the mobile index (drift guard)", () => {
    const appFrame = navItemsFor("appFrame").map(i => i.href);
    const mobile = new Set(navItemsFor("mobileIndex").map(i => i.href));
    expect(appFrame.filter(href => !mobile.has(href))).toEqual([]);
  });

  it("places Enkidu first in the Mitdenken cluster", () => {
    const mitdenken = SITE_NAV_CLUSTERS.find(c => c.key === "mitdenken");
    expect(mitdenken?.items[0]?.href).toBe("/enkidu");
  });

  it("has unique hrefs in the full catalog", () => {
    const hrefs = SITE_NAV_CLUSTERS.flatMap(c => c.items.map(i => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
