/**
 * Eine veröffentlichte Erkenntnis für Zitat-Seite und Teilen-Bild.
 */
import fs from "node:fs";
import path from "node:path";

export interface PublicErkenntnis {
  id: string;
  text: string;
  createdAt: string;
  conceptAnchor: string | null;
  kind: "kernsatz" | "master";
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function findPublicErkenntnis(id: string, root = process.cwd()): PublicErkenntnis | null {
  if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
  const dir = path.join(root, "client/public");
  const held = readJson(path.join(dir, "resonanzen-erkenntnis-withdrawn.json")) as { answerIds?: string[]; masterIds?: string[] } | null;
  const withdrawnAnswers = new Set(held?.answerIds ?? []);
  const withdrawnMasters = new Set(held?.masterIds ?? []);
  const erk = readJson(path.join(dir, "resonanzen-erkenntnisse.json")) as { erkenntnisse?: Array<{ id: string; kernsatz: string; createdAt: string; conceptAnchor: string | null; answerId: string }> } | null;
  const found = (erk?.erkenntnisse ?? []).find(item => item.id === id);
  if (found && found.kernsatz.trim() && !withdrawnAnswers.has(found.answerId)) {
    return { id: found.id, text: found.kernsatz.trim(), createdAt: found.createdAt, conceptAnchor: found.conceptAnchor, kind: "kernsatz" };
  }
  const index = readJson(path.join(dir, "resonanzen-index.json")) as { entries?: Array<{ id: string; response?: string; ts?: string; conceptAnchor?: string | null; status?: string; is_master?: boolean; autoPublished?: boolean }> } | null;
  const master = (index?.entries ?? []).find(entry => entry.id === id && entry.is_master && entry.status === "published" && entry.autoPublished);
  if (!master || withdrawnMasters.has(master.id)) return null;
  const text = (master.response ?? "").replace(/^##\s+Synthese\s*/i, "").split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  return { id: master.id, text: text.slice(0, 500), createdAt: master.ts ?? "", conceptAnchor: master.conceptAnchor ?? null, kind: "master" };
}
