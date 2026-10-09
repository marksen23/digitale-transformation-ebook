import { describe, it, expect } from "vitest";
import { formatAnswerScore } from "../questions";

describe("formatAnswerScore", () => {
  it("zeigt die Cosine für automatische Treffer", () => {
    expect(formatAnswerScore({ score: 0.814 })).toBe("0.81");
  });

  it("kennzeichnet kuratierte Kanten und hängt die Cosine an, wenn sie vorliegt", () => {
    expect(formatAnswerScore({ score: 0.41, manual: true })).toBe("kuratiert · 0.41");
    expect(formatAnswerScore({ score: null, manual: true })).toBe("kuratiert");
  });
});
