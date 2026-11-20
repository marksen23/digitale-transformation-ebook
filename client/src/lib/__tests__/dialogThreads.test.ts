import { describe, expect, it } from "vitest";
import { buildDialogThreads, conceptsWithDialogs, type PublicDialogEntry } from "@/lib/dialogThreads";

function entry(partial: Partial<PublicDialogEntry> & Pick<PublicDialogEntry, "id" | "prompt" | "response">): PublicDialogEntry {
  return {
    ts: "2026-05-01T00:00:00Z",
    endpoint: "dialog",
    status: "published",
    nodeIds: ["resonanz"],
    contextMeta: { kind: "weiterdenken" },
    ...partial,
  };
}

describe("Leser-Dialoge", () => {
  it("hängt nur an, wenn die nächste Frage die Schlussfrage ist, und lässt Rohstoff draußen", () => {
    const threads = buildDialogThreads([
      entry({
        id: "a",
        ts: "2026-05-01T00:00:00Z",
        prompt: "Was bleibt von der Stimme?",
        response: "Sie trägt den Bruch.\n\nWie antwortet der Andere?",
      }),
      entry({
        id: "b",
        ts: "2026-05-02T00:00:00Z",
        prompt: "Wie antwortet der Andere? [Leser-Antwort] Indem er zögert.",
        response: "Das Zögern ist schon die Antwort.",
      }),
      entry({
        id: "c",
        ts: "2026-05-03T00:00:00Z",
        prompt: "Eine ganz andere Frage?",
        response: "Eine eigene Antwort.",
        contextMeta: {},
      }),
      entry({
        id: "raw",
        status: "raw",
        prompt: "Wie antwortet der Andere?",
        response: "Darf nicht erscheinen.",
      }),
      entry({
        id: "other",
        nodeIds: ["schatten"],
        prompt: "Was bleibt von der Stimme?",
        response: "Gehört woanders hin.",
      }),
    ], "resonanz");

    expect(threads).toHaveLength(2);
    expect(threads[0].id).toBe("c");
    expect(threads[1].steps.map(s => s.id)).toEqual(["a", "b"]);
    expect(threads[1].steps[1].reader).toContain("zögert");
    expect(threads[1].steps[1].kind).toBe("weiterdenken");
    expect(threads[0].steps[0].kind).toBe("dialog");
    expect(threads.some(t => t.steps.some(s => s.id === "raw" || s.id === "other"))).toBe(false);
  });

  it("zählt Begriffe nur aus gesicherten Dialogen", () => {
    const rows = conceptsWithDialogs([
      entry({ id: "a", prompt: "Frage?", response: "Antwort.", nodeIds: ["echo", "stimme"] }),
      entry({ id: "b", status: "rejected", prompt: "Frage?", response: "Nein.", nodeIds: ["welt"] }),
    ]);
    expect(rows.map(r => r.id)).toEqual(["echo", "stimme"]);
    expect(rows[0].steps).toBe(1);
  });
});
