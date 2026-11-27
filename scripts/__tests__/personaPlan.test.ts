import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { densitySnapshot, validatePlan } from "../../tools/persona-run/plan.js";
import { runPlan } from "../../tools/persona-run/run.js";

const example = path.resolve(import.meta.dirname, "../../tools/persona-run/plan.example.json");

describe("Persona-Lauf", () => {
  it("nimmt das Beispiel an und zählt nur Begriffe", () => {
    const checked = validatePlan(JSON.parse(fs.readFileSync(example, "utf8")));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const snapshot = densitySnapshot(checked.plan, "2026-11-27");
    expect(snapshot.total).toBe(3);
    expect(snapshot.counts).toEqual({ resonanz: 1, echo: 1, gelassenheit: 1, schatten: 1, licht: 1 });
    expect(snapshot.kinds).toEqual({ analyse: 1, dialog: 1, path: 1 });
    expect(JSON.stringify(snapshot)).not.toMatch(/token|api[_-]?key|secret/i);
  });

  it("weist Schlüssel und leere Pläne ab", () => {
    expect(validatePlan({ version: 1, steps: [] }).ok).toBe(false);
    const secret = validatePlan({
      version: 1,
      steps: [{ kind: "dialog", nodeIds: ["resonanz"], note: "Bearer abcdef" }],
    });
    expect(secret.ok).toBe(false);
  });

  it("schreibt ohne Versand nur die Dichte", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "persona-plan-"));
    const planPath = path.join(dir, "plan.json");
    fs.writeFileSync(planPath, fs.readFileSync(example));
    const result = runPlan(planPath, { write: false, now: new Date("2026-11-27T08:00:00.000Z") });
    expect(result.snapshotPath).toBeNull();
    expect(result.summary).toContain("kein Versand");
    expect(result.summary).toContain("resonanz + echo");
    fs.rmSync(dir, { recursive: true });
  });
});
