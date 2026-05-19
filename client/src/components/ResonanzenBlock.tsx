/**
 * ResonanzenBlock — der "Begegnungen aus dem Wissen"-Bereich der Begriff-
 * Sidebar im Begriffsnetz, in zwei Varianten:
 *
 *   variant="framed" — Desktop-Sidebar:
 *     ┌─ ❦ BEGEGNUNGEN AUS DEM WISSEN ··· 8 + 3 ─┐
 *     │  [ResonanzCard framed]                   │
 *     │  [ResonanzCard framed]                   │
 *     │  …                                       │
 *     │  [ 3 weitere im kollektiven Wissen → ]   │
 *     └──────────────────────────────────────────┘
 *     Mit Akzent-Border-Left, Gradient-Background, ohne Expand.
 *     Default 8 Karten (newest first).
 *
 *   variant="flat" — Mobile-Sheet:
 *     ── BEGEGNUNGEN AUS DEM WISSEN ··· 11
 *     [ResonanzCard flat]
 *     [ResonanzCard flat]
 *     [ResonanzCard flat]
 *     [ + 8 weitere ] [ alle im Wissen → ]
 *     Mit Border-Top-Separator, ohne Frame, mit Expand-Toggle (controlled).
 *     Default 3 Karten.
 *
 * Beide Varianten teilen die innere ResonanzCard-Komponente — dadurch
 * propagiert ein Look-Change (Datum-Format, Trunkierung) automatisch.
 *
 * Verwendung:
 *   <ResonanzenBlock
 *     entries={resonanzenByNode.get(selectedNode.id) ?? []}
 *     nodeId={selectedNode.id}
 *     c={C}
 *     variant="framed"
 *   />
 *
 *   <ResonanzenBlock
 *     entries={resonanzenByNode.get(selectedNode.id) ?? []}
 *     nodeId={selectedNode.id}
 *     c={C}
 *     variant="flat"
 *     expanded={resonanzenExpanded}
 *     onToggleExpand={() => setResonanzenExpanded(v => !v)}
 *   />
 */
import type { Palette } from "@/lib/theme";
import { MONO } from "@/lib/theme";
import type { ResonanzEntry } from "@/lib/resonanzenIndex";
import ResonanzCard from "@/components/ResonanzCard";

interface ResonanzenBlockProps {
  entries: ResonanzEntry[];
  nodeId: string;
  c: Palette;
  variant: "framed" | "flat";
  /** Kontrollierter Expand-State für flat-Variante. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export default function ResonanzenBlock({
  entries,
  nodeId,
  c,
  variant,
  expanded = false,
  onToggleExpand,
}: ResonanzenBlockProps) {
  if (entries.length === 0) return null;

  if (variant === "framed") {
    const sorted = entries.slice().sort((a, b) => b.ts.localeCompare(a.ts));
    const TOP_N = 8;
    const visible = sorted.slice(0, TOP_N);
    const remaining = Math.max(0, sorted.length - TOP_N);
    return (
      <div style={{
        marginTop: "1.6rem",
        border: `1px solid ${c.border}`,
        borderLeft: `3px solid ${c.accent}`,
        borderRadius: "0 6px 6px 0",
        padding: "0.8rem 0.9rem",
        background: `linear-gradient(to bottom, ${c.accentDim}11, transparent 60%)`,
      }}>
        <div style={{
          fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em",
          color: c.accent, textTransform: "uppercase", marginBottom: "0.6rem",
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
        }}>
          <span>❦ Begegnungen aus dem Wissen</span>
          <span style={{ color: c.muted, fontFamily: MONO, fontSize: "0.55rem" }}>
            {visible.length}{remaining > 0 ? ` + ${remaining}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {visible.map(entry => (
            <ResonanzCard key={entry.id} entry={entry} c={c} variant="framed" />
          ))}
        </div>
        <a
          href={`/resonanzen?tag=${nodeId}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: "0.7rem",
            fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: c.accent, background: "none",
            border: `1px solid ${c.accentDim}`, borderRadius: 4,
            padding: "0.4rem 0.65rem", textDecoration: "none",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = `${c.accentDim}22`;
            e.currentTarget.style.color = c.textBright;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = c.accent;
          }}
        >
          <span>
            {remaining > 0 ? `${remaining} weitere im kollektiven Wissen` : "im kollektiven Wissen ansehen"}
          </span>
          <span style={{ fontSize: "0.75rem" }}>→</span>
        </a>
      </div>
    );
  }

  // variant === "flat" (Mobile-Sheet)
  const visible = expanded ? entries : entries.slice(0, 3);
  return (
    <div style={{
      borderTop: `1px solid ${c.border}`,
      paddingTop: "0.75rem", marginTop: "0.4rem", marginBottom: "0.6rem",
    }}>
      <div style={{
        fontFamily: MONO, fontSize: "0.54rem", letterSpacing: "0.15em",
        color: c.muted, textTransform: "uppercase", marginBottom: "0.55rem",
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <span>Begegnungen aus dem Wissen</span>
        <span style={{ color: c.accent }}>{entries.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {visible.map(entry => (
          <ResonanzCard key={entry.id} entry={entry} c={c} variant="flat" />
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        {entries.length > 3 && onToggleExpand && (
          <button
            onClick={onToggleExpand}
            style={{
              fontFamily: MONO, fontSize: "0.52rem", letterSpacing: "0.1em",
              textTransform: "uppercase", color: c.muted, background: "none",
              border: `1px solid ${c.border}`, padding: "0.28rem 0.55rem",
              cursor: "pointer",
            }}
          >
            {expanded ? "einklappen" : `+ ${entries.length - 3} weitere`}
          </button>
        )}
        <a
          href={`/resonanzen?tag=${nodeId}`}
          style={{
            fontFamily: MONO, fontSize: "0.52rem", letterSpacing: "0.1em",
            textTransform: "uppercase", color: c.accent, background: "none",
            border: `1px solid ${c.accentDim}`, padding: "0.28rem 0.55rem",
            textDecoration: "none",
          }}
        >
          alle im Wissen →
        </a>
      </div>
    </div>
  );
}
