import { describe, expect, it } from "vitest";
import { cosineSim } from "../lib/embeddingClient";

// ─── cosineSim ───────────────────────────────────────────────────────────────

describe("cosineSim", () => {
  it("returns 1.0 for identical vectors", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSim([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it("returns -1.0 for opposite vectors", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("returns 0 for a zero vector", () => {
    expect(cosineSim([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSim([1, 2], [1, 2, 3])).toBe(0);
  });

  it("is symmetric: sim(a,b) === sim(b,a)", () => {
    const a = [0.3, 0.7, 0.1];
    const b = [0.9, 0.1, 0.5];
    expect(cosineSim(a, b)).toBeCloseTo(cosineSim(b, a));
  });

  it("returns value in [-1, 1] for arbitrary unit-ish vectors", () => {
    const a = [0.1, 0.5, 0.3, 0.9];
    const b = [0.8, 0.2, 0.6, 0.1];
    const s = cosineSim(a, b);
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("produces the same result as the manual formula for known inputs", () => {
    // [1,1] · [1,0] = 1, |[1,1]|=sqrt(2), |[1,0]|=1 → cos = 1/sqrt(2) ≈ 0.7071
    expect(cosineSim([1, 1], [1, 0])).toBeCloseTo(0.7071, 3);
  });
});
