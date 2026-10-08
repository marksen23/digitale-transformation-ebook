import { describe, expect, it } from "vitest";
import { MAX_WIDTH, RADIUS, TRANSITION, SHADOW } from "@/lib/theme";

describe("MAX_WIDTH tokens", () => {
  it("has three steps in ascending order", () => {
    expect(MAX_WIDTH.content).toBeLessThan(MAX_WIDTH.prose);
    expect(MAX_WIDTH.prose).toBeLessThan(MAX_WIDTH.reader);
  });

  it("content fits a typical mobile-first narrow column", () => {
    expect(MAX_WIDTH.content).toBeGreaterThanOrEqual(720);
    expect(MAX_WIDTH.content).toBeLessThanOrEqual(800);
  });

  it("reader is wide enough for a two-column layout", () => {
    expect(MAX_WIDTH.reader).toBeGreaterThanOrEqual(920);
  });
});

describe("RADIUS tokens", () => {
  it("button is smaller than card which is smaller than panel", () => {
    const px = (s: string) => parseInt(s, 10);
    expect(px(RADIUS.button)).toBeLessThan(px(RADIUS.card));
    expect(px(RADIUS.card)).toBeLessThan(px(RADIUS.panel));
  });
});

describe("TRANSITION token", () => {
  it("includes 'ease' easing function", () => {
    expect(TRANSITION).toContain("ease");
  });

  it("is under 200ms for snappy UI", () => {
    const ms = parseInt(TRANSITION.match(/(\d+)ms/)?.[1] ?? "0", 10);
    const s = parseFloat(TRANSITION.match(/([\d.]+)s/)?.[1] ?? "0");
    const totalMs = ms + s * 1000;
    expect(totalMs).toBeLessThanOrEqual(200);
  });
});

describe("SHADOW tokens", () => {
  it("defines card, panel, and hover variants", () => {
    expect(typeof SHADOW.card).toBe("string");
    expect(typeof SHADOW.panel).toBe("string");
    expect(typeof SHADOW.hover).toBe("string");
  });
});
