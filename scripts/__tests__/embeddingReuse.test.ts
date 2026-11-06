import { describe, expect, it, vi } from "vitest";
import {
  buildEmbeddingSet,
  embedTextHash,
  planReuse,
  type EmbeddingFile,
} from "../lib/embeddingReuse";

const MODEL = "gemini-embedding-001";
const items = [
  { id: "a", text: "Alpha: Beschreibung" },
  { id: "b", text: "Beta: Beschreibung" },
];

function fileWithHashes(): EmbeddingFile {
  return {
    generatedAt: "2026-10-17T00:00:00.000Z",
    model: MODEL,
    embeddings: { a: [1, 0], b: [0, 1] },
    hashes: { a: embedTextHash(items[0].text, MODEL), b: embedTextHash(items[1].text, MODEL) },
  };
}

describe("embedTextHash", () => {
  it("hängt von Text und Modell ab", () => {
    expect(embedTextHash("x", MODEL)).toBe(embedTextHash("x", MODEL));
    expect(embedTextHash("x", MODEL)).not.toBe(embedTextHash("y", MODEL));
    expect(embedTextHash("x", MODEL)).not.toBe(embedTextHash("x", "anderes-modell"));
  });
});

describe("planReuse", () => {
  it("unveränderte Texte → alles wiederverwendet", () => {
    const plan = planReuse(items, fileWithHashes(), MODEL);
    expect(plan.toEmbed).toEqual([]);
    expect(Object.keys(plan.reused)).toEqual(["a", "b"]);
  });

  it("geänderter Text → nur dieser wird neu eingebettet", () => {
    const changed = [items[0], { id: "b", text: "Beta: neue Beschreibung" }];
    const plan = planReuse(changed, fileWithHashes(), MODEL);
    expect(plan.toEmbed.map(i => i.id)).toEqual(["b"]);
    expect(plan.stale.b.vector).toEqual([0, 1]);
  });

  it("Modellwechsel → alles neu", () => {
    const plan = planReuse(items, { ...fileWithHashes(), model: "text-embedding-004" }, MODEL);
    expect(plan.reason).toBe("model-mismatch");
    expect(plan.toEmbed).toHaveLength(2);
  });

  it("Altbestand ohne Hashes → per ID + Modell übernommen", () => {
    const legacy: EmbeddingFile = { model: MODEL, embeddings: { a: [1, 0], b: [0, 1] } };
    const plan = planReuse(items, legacy, MODEL);
    expect(plan.legacy).toBe(true);
    expect(plan.toEmbed).toEqual([]);
  });

  it("force → alles neu", () => {
    expect(planReuse(items, fileWithHashes(), MODEL, { force: true }).toEmbed).toHaveLength(2);
  });

  it("neuer Eintrag ohne Vektor → wird eingebettet", () => {
    const plan = planReuse([...items, { id: "c", text: "Gamma" }], fileWithHashes(), MODEL);
    expect(plan.toEmbed.map(i => i.id)).toEqual(["c"]);
  });
});

describe("buildEmbeddingSet", () => {
  const now = () => "2026-11-06T00:00:00.000Z";

  it("ohne Änderungen: kein Embedding-Call, Datei bleibt unangetastet", async () => {
    const embed = vi.fn(async () => [9, 9]);
    const res = await buildEmbeddingSet({ label: "t", items, existing: fileWithHashes(), model: MODEL, embed, now });
    expect(embed).not.toHaveBeenCalled();
    expect(res.file).toBeNull();
    expect(res.reused).toBe(2);
  });

  it("Altbestand: kein Call, aber einmal mit Hashes schreiben", async () => {
    const embed = vi.fn(async () => [9, 9]);
    const legacy: EmbeddingFile = { model: MODEL, embeddings: { a: [1, 0], b: [0, 1] } };
    const res = await buildEmbeddingSet({ label: "t", items, existing: legacy, model: MODEL, embed, now });
    expect(embed).not.toHaveBeenCalled();
    expect(res.file?.hashes).toEqual(fileWithHashes().hashes);
    expect(res.file?.embeddings).toEqual(legacy.embeddings);
  });

  it("ein geänderter Text → genau ein Call", async () => {
    const embed = vi.fn(async () => [5, 5]);
    const changed = [items[0], { id: "b", text: "Beta neu" }];
    const res = await buildEmbeddingSet({ label: "t", items: changed, existing: fileWithHashes(), model: MODEL, embed, now });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(res.file?.embeddings.b).toEqual([5, 5]);
    expect(res.file?.hashes.b).toBe(embedTextHash("Beta neu", MODEL));
  });

  it("entfernter Eintrag fällt aus der Datei", async () => {
    const res = await buildEmbeddingSet({ label: "t", items: [items[0]], existing: fileWithHashes(), model: MODEL, embed: async () => null, now });
    expect(Object.keys(res.file!.embeddings)).toEqual(["a"]);
  });

  it("alle Calls scheitern → wirft mit 402-Hinweis", async () => {
    const embed = vi.fn(async () => null);
    await expect(
      buildEmbeddingSet({ label: "concepts", items, existing: null, model: MODEL, embed, now }),
    ).rejects.toThrow(/402/);
  });

  it("Teilausfall bei geändertem Text → alter Vektor bleibt, Hash bleibt alt (nächster Lauf versucht erneut)", async () => {
    const changed = [{ id: "a", text: "Alpha neu" }, { id: "b", text: "Beta neu" }];
    const embed = vi.fn(async (t: string) => (t === "Alpha neu" ? [7, 7] : null));
    const res = await buildEmbeddingSet({ label: "t", items: changed, existing: fileWithHashes(), model: MODEL, embed, now });
    expect(res.file?.embeddings.b).toEqual([0, 1]);
    expect(res.file?.hashes.b).toBe(fileWithHashes().hashes!.b);
    expect(res.failed).toBe(1);
  });
});
