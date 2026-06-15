import { describe, it, expect } from "vitest";
import { pairKey } from "./conceptEdges";

// pairKey ist der Kern der richtungslosen Kanten-Dedup in promoteEdge. Wäre er
// nicht symmetrisch, ließe sich dieselbe Verbindung zweimal in den Kanon
// erheben (a—b und b—a). Diese Invariante muss halten.

describe("pairKey", () => {
  it("ist symmetrisch (a,b) === (b,a)", () => {
    expect(pairKey("freiheit", "lm-grenze")).toBe(pairKey("lm-grenze", "freiheit"));
    expect(pairKey("z", "a")).toBe(pairKey("a", "z"));
  });

  it("ordnet deterministisch lexikografisch", () => {
    expect(pairKey("b", "a")).toBe("a|b");
    expect(pairKey("a", "b")).toBe("a|b");
  });

  it("trennt mit |", () => {
    expect(pairKey("erkenntnis", "resonanz")).toBe("erkenntnis|resonanz");
  });
});
