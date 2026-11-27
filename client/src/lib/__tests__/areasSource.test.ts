import { describe, expect, it } from "vitest";
import { areasSource } from "@/lib/search/sources/areas";

describe("areasSource", () => {
  it("finds Enkidu as a Mitdenken area", () => {
    const hits = areasSource.search("Enkidu");
    const hit = hits.find(h => h.anchor === "/enkidu");
    expect(hit).toBeTruthy();
    expect(hit?.title).toBe("Enkidu");
    expect(hit?.snippet).toBe("Mitdenken");
  });

  it("finds Hörfassung as a Lesen area", () => {
    const hits = areasSource.search("Hörfassung");
    const hit = hits.find(h => h.anchor === "/hoeren");
    expect(hit).toBeTruthy();
    expect(hit?.title).toBe("Hörfassung");
    expect(hit?.snippet).toBe("Lesen");
  });
});
