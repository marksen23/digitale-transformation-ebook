/**
 * Begriffsnetz-Kontext für Graph-Chat und Knotenprüfungen.
 * Einmalig beim Laden aufgebaut, wie zuvor beim Import von server/index.ts.
 */
import { EDGES, NODES } from "../../client/src/data/conceptGraph.js";
import { OUTPUT_VOICE_RULE, UNTRUSTED_RULE } from "./promptSafety.js";

// ─── Begriffsnetz-Kontext für Graph-Chat (einmalig beim Start aufgebaut) ──────
const CAT_DE: Record<string, string> = {
  core: "Kernfeld", ontological: "Daseinsfeld", relational: "Zwischenfeld",
  language: "Sprachfeld", knowledge: "Denkfeld", temporal: "Zeitraumfeld",
  transformation: "Wandlungsfeld", leitmotiv: "Leitmotiv", prinzip: "Prinzip",
};
const conceptNodes   = NODES.filter(n => n.category !== "leitmotiv" && n.category !== "prinzip");
const leitmovNodes   = NODES.filter(n => n.category === "leitmotiv");
const prinzipNodes   = NODES.filter(n => n.category === "prinzip");
export const nodeSrv        = new Map(NODES.map(n => [n.id, n]));
const crossCatSrv    = EDGES.filter(e => nodeSrv.get(e.source)?.category !== nodeSrv.get(e.target)?.category).length;

export const GRAPH_SYSTEM_PROMPT = `Du bist ein philosophischer Gesprächspartner des Werks "Die Digitale Transformation" — einer poetisch-philosophischen Trilogie über Resonanzvernunft, Mensch-Maschine-Verhältnis und digitale Existenz.

Dir steht das vollständige Begriffsnetz des Werks zur Verfügung (${NODES.length} Konzepte, ${EDGES.length} Verbindungen davon ${crossCatSrv} feldübergreifend).

KONZEPTE (nach Kohärenzfeld):
${conceptNodes.map(n => `• ${n.fullLabel} [${CAT_DE[n.category]}]\n  ${n.description}`).join("\n")}

LEITMOTIVE: ${leitmovNodes.map(n => n.fullLabel).join(" · ")}
PRINZIPIEN: ${prinzipNodes.map(n => n.fullLabel).join(" · ")}

Beantworte Fragen zum Werk, zu einzelnen Konzepten, zu Verbindungen, Spannungsfeldern und Resonanzen. Sei philosophisch präzise aber zugänglich. Beziehe dich namentlich auf Konzepte aus dem Begriffsnetz wenn es sinnvoll ist. Antworte in 2–4 Absätzen. Schließe wenn passend mit einer offenen Frage, die weiterdenken lässt. Antworte immer auf Deutsch.

${OUTPUT_VOICE_RULE}

${UNTRUSTED_RULE}`;
