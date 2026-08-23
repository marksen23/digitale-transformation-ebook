/**
 * MobileMeinWerk — Reader-first-Design, Bereich "Mein Werk": Statistik,
 * Gedankengänge, Dein Fokus, Pfad-Vorschlag, Noch ungesehen, Deine Passagen,
 * Einstellungen. Alle Werte kommen aus MeinWerkPage's echten trajectory.ts/
 * threadStore.ts-Ableitungen (dort berechnet, hier nur neu gerahmt).
 */
import { MONO, SERIF, type Palette } from "@/lib/theme";
import type { Trajectory, getStats } from "@/lib/trajectory";
import type { SavedThread } from "@/lib/threadStore";
import WeiterdenkenThread from "@/components/WeiterdenkenThread";
import MobileScreenShell from "@/pages/mobile/MobileScreenShell";
import MobileStatTile from "@/pages/mobile/MobileStatTile";

interface Props {
  C: Palette;
  navigate: (to: string) => void;
  t: Trajectory;
  stats: ReturnType<typeof getStats>;
  isEmpty: boolean;
  threads: SavedThread[];
  openQ: Array<{ threadId: string; question: string; updatedAt: string }>;
  expandedThread: string | null;
  setExpandedThread: (id: string | null) => void;
  onDeleteThread: (id: string) => void;
  top: Array<{ nodeId: string; count: number }>;
  unvisited: string[];
  pathSuggestion: { from: string; to: string } | null;
  nodeLabel: (id: string) => string;
  confirmReset: boolean;
  setConfirmReset: (v: boolean) => void;
  onReset: () => void;
  onOptOutToggle: () => void;
  onDownload: () => void;
}

export default function MobileMeinWerk({
  C, navigate, t, stats, isEmpty, threads, openQ, expandedThread, setExpandedThread, onDeleteThread,
  top, unvisited, pathSuggestion, nodeLabel, confirmReset, setConfirmReset, onReset, onOptOutToggle, onDownload,
}: Props) {
  const sectionLabel: React.CSSProperties = {
    fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.24em", textTransform: "uppercase", color: C.muted,
  };
  const miniBtn = (color: string): React.CSSProperties => ({
    minHeight: 36, fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase",
    color, background: "none", border: `1px solid ${color}`, padding: "0 10px", cursor: "pointer", borderRadius: 3,
  });

  return (
    <MobileScreenShell C={C} title="Mein Werk" meta="NUR IN DIESEM BROWSER">
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.55, color: C.textDim, marginBottom: 16 }}>
        Eine persönliche Sicht auf deinen Lese-Pfad — wo du warst, was du noch nicht gesehen hast. Alle Daten bleiben in diesem Browser, kein Server-Tracking.
      </div>

      {t.optOut ? (
        <div style={{ padding: 14, border: `1px dashed ${C.border}`, color: C.muted, fontStyle: "italic", fontFamily: SERIF, fontSize: 13 }}>
          Trajektorie ist deaktiviert.{" "}
          <button type="button" onClick={onOptOutToggle} style={{ background: "none", border: "none", color: C.accentText, cursor: "pointer", textDecoration: "underline", font: "inherit" }}>Wieder aktivieren</button>
        </div>
      ) : isEmpty ? (
        <div style={{ border: `1px solid ${C.border}`, background: `${C.accent}08`, borderRadius: 8, padding: "18px 16px" }}>
          <div style={sectionLabel}>Noch nichts gesammelt</div>
          <p style={{ marginTop: 6, fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: C.text, lineHeight: 1.6 }}>
            Diese Seite füllt sich mit deinem Weg durchs Werk — besuchte Begriffe, markierte Passagen, geführte Dialoge und weitergesponnene Gedankenfäden. Beginne irgendwo:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {[["/werk", "Das Werk lesen"], ["/begriffsnetz", "Begriffsnetz erkunden"], ["/landkarte", "Wissens-Landkarte"]].map(([href, label]) => (
              <button key={href} type="button" onClick={() => navigate(href)}
                style={{ minHeight: 40, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: C.accentText, background: "none", border: `1px solid ${C.accentDim}`, borderRadius: 3, padding: "0 12px", cursor: "pointer" }}
              >{label}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>Statistik</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: C.border, border: `1px solid ${C.border}`, marginBottom: 24 }}>
            <MobileStatTile C={C} value={String(stats.visitedCount)} label="Knoten besucht" />
            <MobileStatTile C={C} value={String(stats.totalVisits)} label="Besuche gesamt" />
            <MobileStatTile C={C} value={String(stats.passageCount)} label="Passagen markiert" />
            <MobileStatTile C={C} value={String(stats.expandedCount)} label="Resonanzen geöffnet" />
            <MobileStatTile C={C} value={String(stats.dialogSessions)} label="Dialoge geführt" />
            <MobileStatTile C={C} value={String(stats.weiterdenkenSteps)} label="Weitergedacht" />
            <MobileStatTile C={C} value={String(stats.daysActive)} label="Tage aktiv" />
          </div>

          {(threads.length > 0 || openQ.length > 0) && (
            <>
              <div style={{ ...sectionLabel, marginBottom: 4 }}>Meine Gedankengänge</div>
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, lineHeight: 1.5, color: C.textDim, marginBottom: 10 }}>
                Fäden, die du an offenen Fragen weitergesponnen hast — fortsetzbar, jederzeit.
              </div>
              {threads.map(thread => {
                const isOpen = expandedThread === thread.id;
                const lastIsQuestion = thread.steps[thread.steps.length - 1]?.kind === "frage";
                return (
                  <div key={thread.id} style={{ border: `1px solid ${C.border}`, background: C.deep, padding: "10px 11px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, color: C.textBright, lineHeight: 1.45 }}>{thread.rootQuestion}</div>
                        <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.muted, marginTop: 4, letterSpacing: "0.06em" }}>
                          {thread.steps.length} Schritte · {new Date(thread.updatedAt).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}{lastIsQuestion ? " · offene Frage" : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button type="button" onClick={() => setExpandedThread(isOpen ? null : thread.id)} style={miniBtn(C.accentText)}>{isOpen ? "schließen" : "fortsetzen"}</button>
                        <button type="button" onClick={() => onDeleteThread(thread.id)} style={miniBtn("#c48282")} title="Faden löschen">⌫</button>
                      </div>
                    </div>
                    {isOpen && (
                      <WeiterdenkenThread
                        c={C} initialQuestion={thread.rootQuestion}
                        initialEntries={thread.steps.map(s => ({ kind: s.kind, text: s.text }))}
                        threadId={thread.id} focus={thread.focus} focusedNodeIds={thread.focusedNodeIds}
                      />
                    )}
                  </div>
                );
              })}
              {openQ.length > 0 && (
                <div style={{ marginTop: 12, marginBottom: 24 }}>
                  <div style={{ ...sectionLabel, fontSize: 8.5, marginBottom: 6 }}>Offene Fragen — warten auf dich</div>
                  {openQ.map(q => (
                    <button key={q.threadId} type="button" onClick={() => setExpandedThread(q.threadId)}
                      style={{ display: "block", width: "100%", textAlign: "left", fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: C.textDim, background: "none", border: `1px dashed ${C.border}`, borderLeft: `2px solid ${C.accentDim}`, padding: "8px 11px", cursor: "pointer", lineHeight: 1.45, marginBottom: 5 }}
                    >{q.question}</button>
                  ))}
                </div>
              )}
            </>
          )}

          {top.length > 0 && (
            <>
              <div style={{ ...sectionLabel, marginBottom: 8 }}>Dein Fokus</div>
              <div style={{ marginBottom: 24 }}>
                {top.map(n => (
                  <button key={n.nodeId} type="button" onClick={() => navigate(`/begriffsnetz?node=${encodeURIComponent(n.nodeId)}`)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: "100%", minHeight: 44, padding: "9px 11px", background: C.deep, border: `1px solid ${C.border}`, borderBottom: "none", color: C.text, fontFamily: SERIF, fontSize: 14, cursor: "pointer", textAlign: "left" }}
                  >
                    <span>{nodeLabel(n.nodeId)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, flexShrink: 0 }}>{n.count}× besucht</span>
                  </button>
                ))}
                <div style={{ borderBottom: `1px solid ${C.border}` }} />
              </div>
            </>
          )}

          {pathSuggestion && (
            <div style={{ marginBottom: 24, padding: "13px 14px", background: `${C.accent}08`, borderLeft: `3px solid ${C.accent}` }}>
              <div style={{ ...sectionLabel, color: C.accentText }}>Pfad-Vorschlag</div>
              <div style={{ marginTop: 6, fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.55, color: C.text }}>
                Du warst oft bei <strong>{nodeLabel(pathSuggestion.from)}</strong>, aber <strong>{nodeLabel(pathSuggestion.to)}</strong> hast du noch nicht besucht. Eine Pfad-Analyse zwischen beiden könnte zeigen, wie sie zusammenhängen.
              </div>
              <button type="button" onClick={() => navigate(`/begriffsnetz?from=${pathSuggestion.from}&to=${pathSuggestion.to}`)}
                style={{ marginTop: 11, minHeight: 40, padding: "0 14px", background: "transparent", border: `1px solid ${C.accentText}`, borderRadius: 4, color: C.accentText, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}
              >→ Pfad öffnen</button>
            </div>
          )}

          {unvisited.length > 0 && (
            <>
              <div style={{ ...sectionLabel, marginBottom: 4 }}>Noch ungesehen</div>
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: C.textDim, marginBottom: 9 }}>
                {unvisited.length} {unvisited.length === 1 ? "Konzept hast du" : "Konzepte hast du"} noch nicht besucht:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
                {unvisited.map(id => (
                  <button key={id} type="button" onClick={() => navigate(`/begriffsnetz?node=${encodeURIComponent(id)}`)}
                    style={{ minHeight: 44, padding: "0 12px", fontFamily: SERIF, fontSize: 13, color: C.textDim, background: "none", border: `1px dashed ${C.border}`, cursor: "pointer" }}
                  >{nodeLabel(id)}</button>
                ))}
              </div>
            </>
          )}

          {Object.keys(t.selectedPassages).length > 0 && (
            <>
              <div style={{ ...sectionLabel, marginBottom: 8 }}>Deine Passagen</div>
              <div style={{ marginBottom: 24 }}>
                {Object.entries(t.selectedPassages).slice(0, 8).map(([chunkId, p]) => (
                  <div key={chunkId} style={{ padding: "9px 11px", background: C.deep, border: `1px solid ${C.border}`, marginBottom: 6 }}>
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: C.text, lineHeight: 1.5 }}>»{p.selectionText}«</div>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.muted, marginTop: 4 }}>
                      {new Date(p.ts).toLocaleString("de-DE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 14 }}>
        <div style={{ ...sectionLabel, marginBottom: 10 }}>Einstellungen</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <span style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.45, color: C.text }}>
            Trajektorie aktiv<br /><span style={{ fontSize: 11, color: C.muted }}>alle Daten bleiben in diesem Browser</span>
          </span>
          <button type="button" onClick={onOptOutToggle} aria-label="Trajektorie aktiv"
            style={{ width: 52, height: 44, padding: 0, background: "none", border: "none", position: "relative", cursor: "pointer", flexShrink: 0 }}
          >
            <span style={{ position: "absolute", top: 7, left: 0, width: 52, height: 30, borderRadius: 15, border: `1px solid ${!t.optOut ? C.accentText : C.border}`, background: !t.optOut ? `${C.accent}1a` : "transparent" }} />
            <span style={{ position: "absolute", top: 10, left: !t.optOut ? 25 : 3, width: 22, height: 22, borderRadius: "50%", background: !t.optOut ? C.accentText : C.muted, transition: "left .16s ease" }} />
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={onDownload}
            style={{ minHeight: 40, padding: "0 13px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", cursor: "pointer" }}
          >↓ als JSON herunterladen</button>
          {!confirmReset ? (
            <button type="button" onClick={() => setConfirmReset(true)}
              style={{ minHeight: 40, padding: "0 13px", background: "transparent", border: "1px solid #c48282", borderRadius: 4, color: "#c48282", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", cursor: "pointer" }}
            >⌫ zurücksetzen</button>
          ) : (
            <>
              <button type="button" onClick={onReset}
                style={{ minHeight: 40, padding: "0 13px", background: "#c48282", border: "1px solid #c48282", borderRadius: 4, color: "#fff", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", cursor: "pointer" }}
              >Wirklich löschen?</button>
              <button type="button" onClick={() => setConfirmReset(false)}
                style={{ minHeight: 40, padding: "0 13px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", cursor: "pointer" }}
              >Abbrechen</button>
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 0", fontFamily: MONO, fontSize: 11, letterSpacing: "0.45em", color: C.muted }}>⁂</div>
    </MobileScreenShell>
  );
}
