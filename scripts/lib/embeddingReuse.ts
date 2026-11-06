/**
 * embeddingReuse.ts — Wiederverwendung vorhandener Embeddings über
 * Text-Hash + Modell (für build-search-index: Begriffe + Philosophen).
 *
 * Ein Vektor wird nur dann übernommen, wenn
 *   1. die Datei mit demselben Embedding-Modell erzeugt wurde und
 *   2. der gespeicherte Hash zum aktuellen Embed-Text passt.
 * Sonst wird neu eingebettet. Ein Lauf ohne geänderte Texte macht damit
 * keinen einzigen Gemini-Call.
 *
 * Dateiformat (abwärtskompatibel, Leser nutzen nur `embeddings`):
 *   { generatedAt, model, embeddings: { [id]: number[] }, hashes?: { [id]: string } }
 *
 * Altbestand ohne `hashes` (vor Einführung dieses Moduls): Der Text lässt
 * sich aus dem Vektor nicht rekonstruieren. Bisher hat jeder erfolgreiche
 * Lauf die Datei komplett neu geschrieben, sie passt also zu den Quelltexten
 * des letzten grünen Laufs. Deshalb gilt einmalig: gleiches Modell + Vektor
 * für die ID vorhanden → übernehmen und den Hash des aktuellen Texts
 * eintragen. Wer das nicht will (z. B. Texte seitdem geändert), erzwingt mit
 * SEARCH_INDEX_FORCE=1 eine komplette Neu-Einbettung.
 */
import crypto from "node:crypto";

export interface EmbeddingFile {
  generatedAt?: string;
  model?: string;
  embeddings?: Record<string, number[]>;
  hashes?: Record<string, string>;
}

export interface EmbedItem {
  id: string;
  text: string;
}

export interface ReusePlan {
  /** Übernommene Vektoren (id → Vektor). */
  reused: Record<string, number[]>;
  /** Hashes der übernommenen Einträge. */
  reusedHashes: Record<string, string>;
  /** Neu einzubettende Einträge. */
  toEmbed: EmbedItem[];
  /** Hash pro aktueller ID (für neu eingebettete Einträge). */
  hashes: Record<string, string>;
  /** Alte Vektoren für geänderte Texte (Rückfall, falls Neu-Einbettung scheitert). */
  stale: Record<string, { vector: number[]; hash: string | undefined }>;
  /** Warum nichts übernommen wurde, falls zutreffend. */
  reason: "ok" | "no-file" | "model-mismatch" | "forced";
  /** true, wenn die Datei noch keine Hashes hatte (einmaliges Upgrade). */
  legacy: boolean;
}

/** Stabiler Hash über Modell + Embed-Text. */
export function embedTextHash(text: string, model: string): string {
  return crypto.createHash("sha256").update(`${model}\n${text}`).digest("hex").slice(0, 16);
}

export function planReuse(
  items: EmbedItem[],
  existing: EmbeddingFile | null,
  model: string,
  opts: { force?: boolean } = {},
): ReusePlan {
  const hashes: Record<string, string> = {};
  for (const it of items) hashes[it.id] = embedTextHash(it.text, model);

  const plan: ReusePlan = {
    reused: {}, reusedHashes: {}, toEmbed: [], hashes, stale: {},
    reason: "ok", legacy: false,
  };

  const vectors = existing?.embeddings ?? {};
  if (opts.force) plan.reason = "forced";
  else if (!existing || Object.keys(vectors).length === 0) plan.reason = "no-file";
  else if ((existing.model ?? "") !== model) plan.reason = "model-mismatch";

  if (plan.reason !== "ok") {
    plan.toEmbed = [...items];
    return plan;
  }

  const oldHashes = existing!.hashes;
  plan.legacy = !oldHashes;
  for (const it of items) {
    const vec = vectors[it.id];
    const valid = Array.isArray(vec) && vec.length > 0;
    const hashOk = oldHashes ? oldHashes[it.id] === hashes[it.id] : true;
    if (valid && hashOk) {
      plan.reused[it.id] = vec;
      plan.reusedHashes[it.id] = hashes[it.id];
    } else {
      plan.toEmbed.push(it);
      if (valid) plan.stale[it.id] = { vector: vec, hash: oldHashes?.[it.id] };
    }
  }
  return plan;
}

/**
 * Setzt das Ergebnis zusammen: übernommene + neue Vektoren. Ist die
 * Neu-Einbettung eines geänderten Texts gescheitert, bleibt der alte Vektor
 * mit seinem alten Hash stehen; der nächste Lauf versucht es dann erneut.
 */
export function mergeEmbeddings(
  plan: ReusePlan,
  fresh: Record<string, number[]>,
): { embeddings: Record<string, number[]>; hashes: Record<string, string> } {
  const embeddings: Record<string, number[]> = { ...plan.reused };
  const hashes: Record<string, string> = { ...plan.reusedHashes };
  for (const it of plan.toEmbed) {
    if (fresh[it.id]) {
      embeddings[it.id] = fresh[it.id];
      hashes[it.id] = plan.hashes[it.id];
    } else if (plan.stale[it.id]) {
      embeddings[it.id] = plan.stale[it.id].vector;
      // Ohne alten Hash keinen eintragen → nächster Lauf bettet neu ein.
      if (plan.stale[it.id].hash) hashes[it.id] = plan.stale[it.id].hash!;
    }
  }
  return { embeddings: sortKeys(embeddings), hashes: sortKeys(hashes) };
}

/**
 * true, wenn sich der Dateiinhalt (ohne generatedAt) ändern würde. Dann muss
 * geschrieben werden; sonst bleibt die Datei unangetastet (kein Commit-Rauschen).
 */
export function embeddingFileChanged(
  existing: EmbeddingFile | null,
  next: { model: string; embeddings: Record<string, number[]>; hashes: Record<string, string> },
): boolean {
  if (!existing) return true;
  if ((existing.model ?? "") !== next.model) return true;
  if (!existing.hashes) return true;
  return (
    JSON.stringify(sortKeys(existing.hashes)) !== JSON.stringify(next.hashes) ||
    JSON.stringify(sortKeys(existing.embeddings ?? {})) !== JSON.stringify(next.embeddings)
  );
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

export interface EmbeddingSetResult {
  /** Neuer Dateiinhalt, oder null wenn sich nichts geändert hat (nicht schreiben). */
  file: (Required<Pick<EmbeddingFile, "generatedAt" | "model" | "embeddings" | "hashes">>) | null;
  reused: number;
  added: number;
  failed: number;
  reason: ReusePlan["reason"];
  legacy: boolean;
}

/**
 * Kompletter Ablauf für eine Embedding-Datei (ohne Datei-I/O, testbar):
 * planen → nur Fehlendes/Geändertes einbetten → zusammensetzen.
 *
 * Wirft, wenn es etwas einzubetten gab, aber KEIN Call gelang (API down,
 * Guthaben leer, Key tot). Dann bleibt die bestehende Datei unangetastet und
 * der Workflow wird rot.
 */
export async function buildEmbeddingSet(opts: {
  label: string;
  items: EmbedItem[];
  existing: EmbeddingFile | null;
  model: string;
  embed: (text: string) => Promise<number[] | null>;
  force?: boolean;
  throttleMs?: number;
  now?: () => string;
}): Promise<EmbeddingSetResult> {
  const plan = planReuse(opts.items, opts.existing, opts.model, { force: opts.force });
  const fresh: Record<string, number[]> = {};
  let added = 0;
  let failed = 0;
  for (const it of plan.toEmbed) {
    const vec = await opts.embed(it.text);
    if (vec) { fresh[it.id] = vec; added++; } else { failed++; }
    if (opts.throttleMs) await new Promise(r => setTimeout(r, opts.throttleMs));
  }
  if (plan.toEmbed.length > 0 && added === 0) {
    throw new Error(
      `[build-search-index] FATAL: 0 erfolgreiche Embedding-Calls bei ${plan.toEmbed.length} Versuchen (${opts.label}). ` +
      `Wahrscheinliche Ursachen: Gemini-Guthaben aufgebraucht (402 Payment Required / RESOURCE_EXHAUSTED ` +
      `„prepayment credits are depleted“ → in AI Studio aufladen), GCP-Billing gesperrt (403 dunning / ` +
      `PERMISSION_DENIED), ungültiger Key, oder Modell-Endpoint entfernt. Abhilfe in allen Billing-Fällen: ` +
      `GEMINI_API_KEY_FALLBACK auf einem zahlungsfähigen Projekt setzen. Siehe Fetch-Fehler oben.`,
    );
  }
  const merged = mergeEmbeddings(plan, fresh);
  const next = { model: opts.model, ...merged };
  const changed = embeddingFileChanged(opts.existing, next);
  return {
    file: changed ? { generatedAt: (opts.now ?? (() => new Date().toISOString()))(), ...next } : null,
    reused: Object.keys(plan.reused).length,
    added,
    failed,
    reason: plan.reason,
    legacy: plan.legacy,
  };
}
