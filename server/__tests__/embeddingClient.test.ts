import { describe, it, expect } from "vitest";
import { cosineSim } from "../lib/embeddingClient.js";

describe("cosineSim", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0];
    expect(cosineSim(v, v)).toBeCloseTo(1, 5);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("returns -1 for opposite vectors", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });
  it("returns 0 for mismatched lengths", () => {
    expect(cosineSim([1, 0], [1, 0, 0])).toBe(0);
  });
  it("returns 0 for zero vector", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
  it("is symmetric", () => {
    const a = [0.3, 0.7, 0.1];
    const b = [0.5, 0.2, 0.9];
    expect(cosineSim(a, b)).toBeCloseTo(cosineSim(b, a), 8);
  });
  it("handles high-dimensional vectors", () => {
    const n = 3072;
    const a = Array.from({ length: n }, () => Math.random());
    const b = [...a];
    expect(cosineSim(a, b)).toBeCloseTo(1, 4);
  });
});
