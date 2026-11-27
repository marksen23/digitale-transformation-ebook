/**
 * Plan eines Leser-Laufs. Nur öffentliche Schritte und Zählungen.
 * Keine Schlüssel, keine Personen, keine Prompt-Journale.
 */

export const STEP_KINDS = ["analyse", "dialog", "graph-chat", "enkidu", "passage", "path"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

const ID_RE = /^[a-z0-9äöüß_+-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SECRET_RE = /(api[_-]?key|secret|token|bearer\s+[a-z0-9])/i;

export interface PersonaStep {
  kind: StepKind;
  nodeIds: string[];
  note: string;
}

export interface PersonaPlan {
  version: 1;
  steps: PersonaStep[];
}

export interface DensitySnapshot {
  date: string;
  total: number;
  counts: Record<string, number>;
  kinds: Record<string, number>;
}

export function validatePlan(input: unknown): { ok: true; plan: PersonaPlan } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Plan fehlt." };
  const raw = input as { version?: unknown; steps?: unknown };
  if (raw.version !== 1) return { ok: false, error: "Nur Plan-Version 1." };
  if (!Array.isArray(raw.steps) || raw.steps.length === 0 || raw.steps.length > 24) {
    return { ok: false, error: "Ein Lauf hat 1 bis 24 Schritte." };
  }
  const steps: PersonaStep[] = [];
  for (const step of raw.steps) {
    if (!step || typeof step !== "object") return { ok: false, error: "Schritt unlesbar." };
    const item = step as { kind?: unknown; nodeIds?: unknown; note?: unknown };
    if (!STEP_KINDS.includes(item.kind as StepKind)) return { ok: false, error: "Unbekannte Schrittart." };
    if (!Array.isArray(item.nodeIds) || item.nodeIds.length === 0 || item.nodeIds.length > 4) {
      return { ok: false, error: "Jeder Schritt nennt 1 bis 4 Begriffs-ids." };
    }
    if (!item.nodeIds.every(id => typeof id === "string" && ID_RE.test(id))) {
      return { ok: false, error: "Begriffs-id ungültig." };
    }
    const note = typeof item.note === "string" ? item.note.trim() : "";
    if (note.length > 200) return { ok: false, error: "Notiz zu lang." };
    if (SECRET_RE.test(note) || SECRET_RE.test(JSON.stringify(item.nodeIds))) {
      return { ok: false, error: "Schlüssel gehören nicht in den Plan." };
    }
    steps.push({ kind: item.kind as StepKind, nodeIds: [...item.nodeIds], note });
  }
  return { ok: true, plan: { version: 1, steps } };
}

export function densitySnapshot(plan: PersonaPlan, day: string): DensitySnapshot {
  if (!DAY_RE.test(day)) throw new Error("Tag muss YYYY-MM-DD sein.");
  const counts: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  for (const step of plan.steps) {
    kinds[step.kind] = (kinds[step.kind] ?? 0) + 1;
    for (const id of step.nodeIds) counts[id] = (counts[id] ?? 0) + 1;
  }
  return { date: day, total: plan.steps.length, counts, kinds };
}
