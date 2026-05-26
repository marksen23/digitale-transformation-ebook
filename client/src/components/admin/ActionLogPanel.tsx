/**
 * ActionLogPanel — sichtbares Audit-Protokoll aller Admin-Mutationen
 * (Sprint F1).
 *
 * Anlass: Erfolge wischen sich durch das System wie Wasser über Glas —
 * Fehler ebenso. „Wir verändern uns nicht, indem wir fehlerfrei bleiben."
 * Hier bleibt jeder Misslungene Versuch sichtbar, bis der Werkstättige
 * ihn anerkannt hat.
 *
 * Verhalten:
 *   - Standardansicht: nur Misslungenes, neueste oben
 *   - Toggle „auch erfolgreiche anzeigen": volle History
 *   - Klick auf Eintrag → Detail (reason, payload, retry?)
 *   - „Log leeren" — bewusster Reset
 */
import { useEffect, useState } from "react";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";
import {
  getActionLog, clearActionLog, getActionLogStats,
  ACTION_LABEL, ACTION_LOG_CHANGED_EVENT,
  type ActionLogEntry,
} from "@/lib/adminActionLog";

export default function ActionLogPanel({ c }: { c: Palette }) {
  const [entries, setEntries] = useState<ActionLogEntry[]>(() => getActionLog(40));
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    function refresh() { setEntries(getActionLog(80)); }
    window.addEventListener(ACTION_LOG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ACTION_LOG_CHANGED_EVENT, refresh);
  }, []);

  const stats = getActionLogStats();
  const visible = showAll ? entries : entries.filter(e => !e.ok);
  const hasFailures = stats.failed > 0;

  return (
    <section style={{
      marginBottom: "1.5rem",
      background: hasFailures ? `${"#c48282"}06` : c.surface,
      border: `1px solid ${hasFailures ? "#c48282" : c.border}`,
      borderLeft: `3px solid ${hasFailures ? "#c48282" : c.muted}`,
      padding: "0.9rem 1rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <SectionLabel c={c} size="sm" variant={hasFailures ? "warnung" : "default"}>
          Aktions-Protokoll
        </SectionLabel>
        <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.muted, letterSpacing: "0.08em" }}>
          {stats.total === 0 ? (
            "keine Aktionen bisher"
          ) : (
            <>
              {stats.failed} Misslungenes · {stats.total - stats.failed} Erfolge
            </>
          )}
        </div>
      </div>

      {stats.total === 0 ? (
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: c.textDim, margin: 0 }}>
          Noch nichts geschehen. Sobald du eine Curation-Aktion startest,
          wird sie hier festgehalten — auch dann, wenn sie scheitert.
        </p>
      ) : visible.length === 0 ? (
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: c.textDim, margin: 0 }}>
          Keine misslungenen Aktionen. <button onClick={() => setShowAll(true)} style={{ background: "none", border: "none", padding: 0, color: c.accent, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px", fontFamily: "inherit", fontStyle: "inherit", fontSize: "inherit" }}>auch Erfolge anzeigen</button>
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "min(60vh, 360px)", overflowY: "auto" }}>
          {visible.map(e => (
            <LogRow
              key={e.id}
              entry={e}
              c={c}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId(id => id === e.id ? null : e.id)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {stats.total > 0 && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase",
              color: c.muted, background: "none", border: `1px solid ${c.border}`,
              padding: "0.3rem 0.55rem", cursor: "pointer", minHeight: 28, borderRadius: 3,
            }}
          >
            {showAll ? "nur Misslungenes" : "auch Erfolge zeigen"}
          </button>
        )}
        {stats.total > 0 && (
          confirmClear ? (
            <>
              <button
                onClick={() => { clearActionLog(); setConfirmClear(false); }}
                style={{
                  fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "#fff", background: "#c48282", border: "1px solid #c48282",
                  padding: "0.3rem 0.55rem", cursor: "pointer", minHeight: 28, borderRadius: 3,
                }}
              >
                Wirklich leeren?
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                style={{
                  fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: c.muted, background: "none", border: `1px solid ${c.border}`,
                  padding: "0.3rem 0.55rem", cursor: "pointer", minHeight: 28, borderRadius: 3,
                }}
              >Abbrechen</button>
            </>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              style={{
                fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase",
                color: c.muted, background: "none", border: "none",
                padding: "0.3rem 0.4rem", cursor: "pointer",
                textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px",
                opacity: 0.7,
              }}
            >
              Log leeren
            </button>
          )
        )}
      </div>
    </section>
  );
}

function LogRow({ entry, c, expanded, onToggle }: { entry: ActionLogEntry; c: Palette; expanded: boolean; onToggle: () => void }) {
  const tsShort = new Date(entry.ts).toLocaleString("de-DE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const okColor = "#7ab898";
  const failColor = "#c48282";
  const label = ACTION_LABEL[entry.type] ?? entry.type;
  const target = entry.targetId ?? (entry.targetCount ? `${entry.targetCount} Einträge` : "—");
  return (
    <div
      onClick={onToggle}
      style={{
        background: entry.ok ? c.surface : `${failColor}08`,
        border: `1px solid ${entry.ok ? c.border : failColor}`,
        borderLeft: `3px solid ${entry.ok ? okColor : failColor}`,
        padding: "0.5rem 0.7rem",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = entry.ok ? c.deep : `${failColor}14`)}
      onMouseLeave={e => (e.currentTarget.style.background = entry.ok ? c.surface : `${failColor}08`)}
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: entry.ok ? okColor : failColor }}>
            {entry.ok ? "✓" : "✕"} {label}
          </span>
          <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {target}
          </span>
        </div>
        <time style={{ fontFamily: MONO, fontSize: "0.48rem", color: c.muted }}>{tsShort}</time>
      </div>
      {!entry.ok && entry.reason && (
        <div style={{ marginTop: "0.25rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.75rem", color: c.text, lineHeight: 1.4 }}>
          {expanded || entry.reason.length <= 90
            ? entry.reason
            : entry.reason.slice(0, 90) + "…"}
        </div>
      )}
      {expanded && entry.payload && Object.keys(entry.payload).length > 0 && (
        <div style={{ marginTop: "0.35rem", fontFamily: MONO, fontSize: "0.5rem", color: c.muted, letterSpacing: "0.04em" }}>
          {Object.entries(entry.payload).map(([k, v]) => (
            <div key={k}>{k}: <span style={{ color: c.text }}>{typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
