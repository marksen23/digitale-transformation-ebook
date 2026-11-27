import { describe, expect, it } from "vitest";
import { citeApa, citePlain, erkenntnisOgSvg } from "../../shared/erkenntnisCite.js";
import { findPublicErkenntnis } from "../lib/erkenntnisPublic.js";

const item = {
  id: "ERK-TEST",
  text: "Freiheit ist Bindung an das Unvollkommene.",
  createdAt: "2026-05-02T00:00:00Z",
};

describe("Zitierfähige Erkenntnis", () => {
  it("baut APA und Klartext mit Jahr und stabiler Adresse", () => {
    const apa = citeApa(item, "https://example.test");
    const plain = citePlain(item, "https://example.test");
    expect(apa.startsWith("Oehring, M. (2026).")).toBe(true);
    expect(apa).toContain(item.text);
    expect(apa).toContain("https://example.test/erkenntnisse/ERK-TEST");
    expect(plain).toContain("Oehring, Markus (2026).");
    expect(plain).toContain(apa.slice(apa.indexOf("https://")));
  });

  it("zeichnet ein SVG ohne rohes Markup aus dem Satz", () => {
    const svg = erkenntnisOgSvg("A < B & C");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("A &lt; B &amp; C");
    expect(svg).not.toContain("A < B");
  });

  it("findet einen veröffentlichten Kernsatz und weist einen unbekannten ab", () => {
    const found = findPublicErkenntnis("ERK-OE1OVO");
    expect(found?.kind).toBe("kernsatz");
    expect(found?.text.length).toBeGreaterThan(20);
    expect(findPublicErkenntnis("gibt-es-nicht")).toBeNull();
    expect(findPublicErkenntnis("../secret")).toBeNull();
  });
});
