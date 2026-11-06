/**
 * insightRegen.ts — Prüfung und Zusammensetzung für die Neuerzeugung der
 * Erkenntnisse und Master-Synthesen. Kein Netz, keine Gemini-Calls.
 */
import crypto from "node:crypto";
import { endsComplete } from "../../server/lib/geminiText.js";

const FORBIDDEN: Array<{ re: RegExp; label: string }> = [
  { re: /\bOehring\b/i, label: "Oehring" },
  { re: /\bMarkus\b/, label: "Markus" },
  { re: /Begriffsraum/i, label: "Begriffsraum" },
  { re: /tiefgründig/i, label: "tiefgründig" },
  { re: /tiefgruendig/i, label: "tiefgruendig" },
  { re: /\b(?:der|die|den|dem|des) Autors?\b/i, label: "Autor" },
];

/** Verstöße gegen Stimme und Schluss. Leer = der Text darf auf die Seite. */
export function voiceViolations(text: string): string[] {
  const hits: string[] = [];
  for (const { re, label } of FORBIDDEN) {
    if (re.test(text)) hits.push(label);
  }
  if (!text.trim()) hits.push("leer");
  else if (!endsComplete(text)) hits.push("unvollständig");
  return hits;
}

/** Nimmt aus einer Destillations-Antwort den einen Satz. */
export function cleanKernsatz(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```(?:\w+)?\s*\n?/, "").replace(/\n?```$/, "").trim();
  t = t.replace(/^(?:Kernsatz|Satz)\s*:\s*/i, "");
  t = t.replace(/^["„]|["“]$/g, "").trim();
  const paras = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const first = paras[0] ?? "";
  if (paras.length > 1 && /[.!?…]$/.test(first)) return first;
  return paras.join(" ").replace(/\s+/g, " ").trim();
}

export function contentHashFor(prompt: string, response: string): string {
  return crypto.createHash("sha256")
    .update(prompt)
    .update("\n---\n")
    .update(response)
    .digest("hex")
    .slice(0, 16);
}

export function setFrontmatterField(fm: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(fm)) return fm.replace(re, `${key}: ${value}`);
  return `${fm.replace(/\s*$/, "")}\n${key}: ${value}`;
}

/**
 * Schreibt einen bestehenden Master neu: dieselbe id (Permalinks), frische
 * Synthese als Antwort, neuer content_hash, Audit-Ereignis angehängt.
 * existingMaster wird bewusst nicht in den Prompt gemischt — die Neuerzeugung
 * soll aus den aktuellen Varianten kommen, nicht aus dem alten Text.
 */
export function renderMasterMarkdown(opts: {
  fmRaw: string;
  now: string;
  variantIds: string[];
  synthesisText: string;
  model: string;
}): string {
  const prompt = extractPromptLine(opts.fmRaw, opts.variantIds);
  const response = opts.synthesisText.trim();
  const hash = contentHashFor(prompt, response);
  let fm = opts.fmRaw.replace(/\s*$/, "");
  fm = setFrontmatterField(fm, "ts", opts.now);
  fm = setFrontmatterField(fm, "created_at", opts.now);
  fm = setFrontmatterField(fm, "master_of", `[${opts.variantIds.join(", ")}]`);
  fm = setFrontmatterField(fm, "variant_count", String(opts.variantIds.length));
  fm = setFrontmatterField(fm, "content_hash", hash);
  fm = setFrontmatterField(fm, "llm", opts.model);
  const event = [
    `  - event: re-synthesized`,
    `    ts: ${opts.now}`,
    `    actor: regenerate-erkenntnisse`,
    `    source_ids: [${opts.variantIds.join(", ")}]`,
  ].join("\n");
  if (/^audit_trail:\s*$/m.test(fm)) fm += `\n${event}`;
  else fm += `\naudit_trail:\n${event}`;

  const frage = `Synthese von ${opts.variantIds.length} Varianten zu: ${anchorFromFm(fm)}`;
  return `---\n${fm}\n---\n\n## Frage\n\n${frage}\n\n## Antwort\n\n${response}\n`;
}

function extractPromptLine(fmRaw: string, variantIds: string[]): string {
  const anchor = anchorFromFm(fmRaw);
  return `Synthese von ${variantIds.length} Varianten zu: ${anchor}`;
}

function anchorFromFm(fm: string): string {
  const m = fm.match(/^anchor:\s*(.+)$/m);
  return (m?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
}

/** true, wenn die Synthese die verlangten Abschnitte trägt und zu Ende kommt. */
export function synthesisShapeOk(text: string): boolean {
  const t = text.trim();
  if (!/^##\s+Synthese\b/m.test(t)) return false;
  if (!/^##\s+Offene Frage\b/m.test(t)) return false;
  if (!voiceViolations(t).length) return true;
  return false;
}
