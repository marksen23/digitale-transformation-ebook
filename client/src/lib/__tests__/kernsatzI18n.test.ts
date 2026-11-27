import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { showKernsatz } from "@/lib/kernsatzI18n";

describe("Kernsatz-Übersetzungen", () => {
  it("zeigt auf Englisch die markierte Übersetzung und sonst den Satz", () => {
    const map = new Map([["A", "An English sentence."]]);
    expect(showKernsatz("A", "Ein Satz.", "de", map)).toEqual({ text: "Ein Satz.", translated: false });
    expect(showKernsatz("A", "Ein Satz.", "en", map)).toEqual({ text: "An English sentence.", translated: true });
    expect(showKernsatz("B", "Ein Satz.", "en", map).translated).toBe(false);
  });

  it("deckt jeden veröffentlichten Kernsatz und nennt sich Übersetzung", () => {
    const root = path.resolve(__dirname, "../../../..");
    const german = JSON.parse(fs.readFileSync(path.join(root, "client/public/resonanzen-erkenntnisse.json"), "utf8"));
    const english = JSON.parse(fs.readFileSync(path.join(root, "client/public/resonanzen-erkenntnisse-en.json"), "utf8"));
    expect(english.kind).toBe("translation");
    expect(english.sourceLang).toBe("de");
    const byId = new Map(english.items.map((item: { id: string; text: string; translated: boolean }) => [item.id, item]));
    for (const entry of german.erkenntnisse as Array<{ id: string }>) {
      const item = byId.get(entry.id) as { text: string; translated: boolean } | undefined;
      expect(item?.translated, entry.id).toBe(true);
      expect(item?.text.length).toBeGreaterThan(20);
    }
  });
});