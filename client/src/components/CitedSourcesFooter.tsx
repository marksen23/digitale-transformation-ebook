/**
 * CitedSourcesFooter — „Quellen im Werk"-Fußzeile unter KI-Ausgaben.
 *
 * Zeigt die vom RAG zitierten Quellen (Werk-Passagen + frühere Resonanzen),
 * die eine KI-Antwort geerdet haben — das sichtbare Gegenstück zum Anti-Drift-
 * Design. Ursprünglich inline in ConceptGraphPage (Analyse/Pfad); hier
 * extrahiert, damit Dialog (graph-chat) und Weiterdenken dasselbe Muster
 * teilen statt es zu duplizieren.
 *
 * `c` ist bewusst ein Minimal-Subset von Palette (nur border/textDim/accent),
 * damit sowohl das geteilte Palette-Objekt als auch das erweiterte
 * ConceptGraphPage-Palette-Objekt ohne Cast passen.
 */
import { SERIF } from "@/lib/theme";

export interface CitedSource {
  source?: "werk" | "resonanz";
  id: string;
  chapter?: string;
  partTitle?: string;
  chapterTitle?: string;
  endpoint?: string;
  prompt?: string;
}

interface CitedSourcesFooterProps {
  sources: CitedSource[];
  c: { border: string; textDim: string; accent: string };
  /** Schriftart-Override (ConceptGraphPage nutzt seine eigene Serife). */
  serifFont?: string;
}

export default function CitedSourcesFooter({ sources, c, serifFont = SERIF }: CitedSourcesFooterProps) {
  if (!sources || sources.length === 0) return null;
  return (
    <div
      style={{
        marginTop: "0.8rem",
        paddingTop: "0.5rem",
        borderTop: `1px dashed ${c.border}`,
        fontFamily: serifFont,
        fontSize: "0.72rem",
        fontStyle: "italic",
        color: c.textDim,
        lineHeight: 1.55,
      }}
    >
      {sources.map(s => (
        <div key={s.id} style={{ marginBottom: "0.15rem" }} title={`${s.source ?? "werk"}: ${s.id}`}>
          {s.source === "resonanz" ? (
            <>
              ↩ frühere Begegnung{" "}
              <a
                href={`/resonanz/${s.id}`}
                style={{ color: c.accent, textDecoration: "underline", textDecorationStyle: "dotted" }}
              >
                {s.prompt?.slice(0, 60)}
                {(s.prompt?.length ?? 0) > 60 ? "…" : ""}
              </a>
            </>
          ) : (
            <>↩ {s.partTitle} · {s.chapterTitle}</>
          )}
        </div>
      ))}
    </div>
  );
}
