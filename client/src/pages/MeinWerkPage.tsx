/**
 * MeinWerkPage (/mein-werk) — Persönliche Lese-Trajektorie
 * (Tier-1-3-Roadmap, Feature C).
 *
 * Liest aus dem LocalStorage (lib/trajectory.ts) was der Reader bisher
 * besucht / markiert / dialogisiert hat. Schlägt Pfade vor zu noch
 * un-besuchten Konzepten. Opt-Out + Reset + JSON-Download.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { NODES } from "@/data/conceptGraph";
import { useTheme } from "@/contexts/ThemeContext";
import { SERIF, MONO, C_DARK, C_LIGHT, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";
import WeiterdenkenThread from "@/components/WeiterdenkenThread";
import {
  getTrajectory, getStats, topNodes, unvisitedFrom,
  resetTrajectory, setOptOut, type Trajectory,
} from "@/lib/trajectory";
import {
  listThreads, openQuestions, deleteThread, type SavedThread,
} from "@/lib/threadStore";

export default function MeinWerkPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();
  const [t, setT] = useState<Trajectory | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [threads, setThreads] = useState<SavedThread[]>([]);
  const [openQ, setOpenQ] = useState<Array<{ threadId: string; question: string; updatedAt: string }>>([]);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  function refreshThreads() {
    setThreads(listThreads());
    setOpenQ(openQuestions());
  }

  useEffect(() => { setT(getTrajectory()); refreshThreads(); }, []);

  function handleDeleteThread(id: string) {
    deleteThread(id);
    if (expandedThread === id) setExpandedThread(null);
    refreshThreads();
  }

  const stats = useMemo(() => t ? getStats() : null, [t]);
  const top = useMemo(() => topNodes(8), [t]);
  const unvisited = useMemo(() => {
    const allIds = NODES.filter(n => n.category !== "leitmotiv" && n.category !== "prinzip").map(n => n.id);
    return unvisitedFrom(allIds).slice(0, 12);
  }, [t]);

  // Pfad-Vorschlag: vom häufigsten Knoten zum ersten un-besuchten Hub
  const pathSuggestion = useMemo(() => {
    if (top.length === 0 || unvisited.length === 0) return null;
    return { from: top[0].nodeId, to: unvisited[0] };
  }, [top, unvisited]);

  function nodeLabel(id: string): string {
    return NODES.find(n => n.id === id)?.fullLabel ?? id;
  }

  function handleReset() {
    resetTrajectory();
    setT(getTrajectory());
    setConfirmReset(false);
  }

  function handleOptOutToggle() {
    if (!t) return;
    setOptOut(!t.optOut);
    setT(getTrajectory());
  }

  function handleDownload() {
    if (!t) return;
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mein-werk-trajektorie-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!t || !stats) return <div style={{ padding: "2rem", fontStyle: "italic" }}>lädt …</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem", color: C.text, fontFamily: SERIF }}>
      <header style={{ marginBottom: "1.5rem", borderBottom: `1px solid ${C.border}`, paddingBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: "1.7rem", color: C.textBright }}>
          Mein Werk
        </h1>
        <p style={{ marginTop: "0.4rem", fontFamily: SERIF, fontStyle: "italic", color: C.textDim, fontSize: "0.95rem", lineHeight: 1.55 }}>
          Eine persönliche Sicht auf deinen Lese-Pfad — wo du warst, was du noch nicht gesehen hast.
          Alle Daten bleiben in diesem Browser, kein Server-Tracking.
        </p>
      </header>

      {t.optOut ? (
        <div style={{ padding: "1rem", border: `1px dashed ${C.border}`, color: C.muted, fontStyle: "italic" }}>
          Trajektorie ist deaktiviert. <button onClick={handleOptOutToggle} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", textDecoration: "underline" }}>Wieder aktivieren</button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <section style={{ marginBottom: "1.5rem" }}>
            <SectionLabel c={C} size="sm" tracking="open">Statistik</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.6rem", marginTop: "0.5rem" }}>
              <Stat label="Knoten besucht"      value={stats.visitedCount} C={C} />
              <Stat label="Besuche gesamt"      value={stats.totalVisits} C={C} />
              <Stat label="Passagen markiert"   value={stats.passageCount} C={C} />
              <Stat label="Resonanzen geöffnet" value={stats.expandedCount} C={C} />
              <Stat label="Dialoge geführt"     value={stats.dialogSessions} C={C} />
              <Stat label="Weitergedacht"       value={stats.weiterdenkenSteps} C={C} />
              <Stat label="Tage aktiv"          value={stats.daysActive} C={C} />
            </div>
          </section>

          {/* Meine Gedankengänge — gespeicherte Weiterdenken-Fäden + offene Fragen */}
          {(threads.length > 0 || openQ.length > 0) && (
            <section style={{ marginBottom: "1.5rem" }}>
              <SectionLabel c={C} size="sm" tracking="open" variant="arbeit">Meine Gedankengänge</SectionLabel>
              <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", color: C.textDim, fontSize: "0.85rem", lineHeight: 1.5 }}>
                Fäden, die du an offenen Fragen weitergesponnen hast — fortsetzbar, jederzeit.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem" }}>
                {threads.map(thread => {
                  const isOpen = expandedThread === thread.id;
                  const lastIsQuestion = thread.steps[thread.steps.length - 1]?.kind === "frage";
                  return (
                    <div key={thread.id} style={{ border: `1px solid ${C.border}`, background: C.deep, padding: "0.6rem 0.7rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.86rem", color: C.textBright, lineHeight: 1.45 }}>
                            {thread.rootQuestion}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, marginTop: "0.25rem", letterSpacing: "0.06em" }}>
                            {thread.steps.length} Schritte · {new Date(thread.updatedAt).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                            {lastIsQuestion ? " · offene Frage" : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                          <button onClick={() => setExpandedThread(isOpen ? null : thread.id)} style={miniBtn(C, C.accent)}>
                            {isOpen ? "schließen" : "fortsetzen"}
                          </button>
                          <button onClick={() => handleDeleteThread(thread.id)} style={miniBtn(C, "#c48282")} title="Faden löschen">⌫</button>
                        </div>
                      </div>
                      {isOpen && (
                        <WeiterdenkenThread
                          c={C}
                          initialQuestion={thread.rootQuestion}
                          initialEntries={thread.steps.map(s => ({ kind: s.kind, text: s.text }))}
                          threadId={thread.id}
                          focus={thread.focus}
                          focusedNodeIds={thread.focusedNodeIds}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {openQ.length > 0 && (
                <div style={{ marginTop: "0.9rem" }}>
                  <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: "0.35rem" }}>
                    Offene Fragen — warten auf dich
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {openQ.map(q => (
                      <button
                        key={q.threadId}
                        onClick={() => setExpandedThread(q.threadId)}
                        style={{ textAlign: "left", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem", color: C.textDim, background: "none", border: `1px dashed ${C.border}`, borderLeft: `2px solid ${C.accentDim}`, padding: "0.4rem 0.6rem", cursor: "pointer", lineHeight: 1.45 }}
                      >
                        {q.question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Top-Knoten */}
          {top.length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <SectionLabel c={C} size="sm" tracking="open">Dein Fokus</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.5rem" }}>
                {top.map(n => (
                  <button
                    key={n.nodeId}
                    onClick={() => navigate(`/begriffsnetz?focus=${n.nodeId}`)}
                    style={{
                      display: "flex", justifyContent: "space-between",
                      width: "100%", padding: "0.4rem 0.6rem",
                      background: C.deep, border: `1px solid ${C.border}`,
                      color: C.text, fontFamily: SERIF, fontSize: "0.9rem",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span>{nodeLabel(n.nodeId)}</span>
                    <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: C.muted }}>{n.count}× besucht</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Pfad-Vorschlag */}
          {pathSuggestion && (
            <section style={{ marginBottom: "1.5rem", padding: "0.9rem 1rem", background: `${C.accent}08`, borderLeft: `3px solid ${C.accent}` }}>
              <SectionLabel c={C} size="sm" tracking="open" variant="werk">Pfad-Vorschlag</SectionLabel>
              <p style={{ marginTop: "0.4rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.92rem", color: C.text, lineHeight: 1.55 }}>
                Du warst oft bei <strong>{nodeLabel(pathSuggestion.from)}</strong>, aber <strong>{nodeLabel(pathSuggestion.to)}</strong> hast du noch nicht besucht. Eine Pfad-Analyse zwischen beiden könnte zeigen, wie sie zusammenhängen.
              </p>
              <button
                onClick={() => navigate(`/begriffsnetz?from=${pathSuggestion.from}&to=${pathSuggestion.to}`)}
                style={{
                  marginTop: "0.5rem",
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "#080808", background: C.accent,
                  border: "none", padding: "0.5rem 0.8rem", cursor: "pointer", minHeight: 36,
                }}
              >
                → Pfad öffnen
              </button>
            </section>
          )}

          {/* Un-besuchte Knoten */}
          {unvisited.length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <SectionLabel c={C} size="sm" tracking="open">Noch ungesehen</SectionLabel>
              <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
                {unvisited.length} {unvisited.length === 1 ? "Konzept hast du" : "Konzepte hast du"} noch nicht besucht:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.4rem" }}>
                {unvisited.map(id => (
                  <button
                    key={id}
                    onClick={() => navigate(`/begriffsnetz?focus=${id}`)}
                    style={{
                      fontFamily: SERIF, fontSize: "0.78rem",
                      color: C.textDim,
                      background: "none", border: `1px dashed ${C.border}`,
                      padding: "0.3rem 0.6rem", cursor: "pointer",
                    }}
                  >
                    {nodeLabel(id)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Markierte Passagen */}
          {Object.keys(t.selectedPassages).length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <SectionLabel c={C} size="sm" tracking="open">Deine Passagen</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
                {Object.entries(t.selectedPassages).slice(0, 8).map(([chunkId, p]) => (
                  <div key={chunkId} style={{ padding: "0.4rem 0.6rem", background: C.deep, border: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text, lineHeight: 1.5 }}>
                      "{p.selectionText}"
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, marginTop: "0.2rem" }}>
                      {new Date(p.ts).toLocaleString("de-DE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Settings */}
      <section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: `1px solid ${C.border}` }}>
        <SectionLabel c={C} size="sm" tracking="open" variant="default">Einstellungen</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.65rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: C.text, cursor: "pointer" }}>
            <input type="checkbox" checked={!t.optOut} onChange={handleOptOutToggle} />
            Trajektorie aktiv (alle Daten bleiben in diesem Browser)
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
            <button
              onClick={handleDownload}
              style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.text, background: "none", border: `1px solid ${C.border}`, padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 36 }}
            >
              ↓ als JSON herunterladen
            </button>
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                style={{ fontFamily: MONO, fontSize: "0.55rem", color: "#c48282", background: "none", border: "1px solid #c48282", padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 36 }}
              >
                ⌫ zurücksetzen
              </button>
            ) : (
              <>
                <button
                  onClick={handleReset}
                  style={{ fontFamily: MONO, fontSize: "0.55rem", color: "#fff", background: "#c48282", border: "1px solid #c48282", padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 36 }}
                >
                  Wirklich löschen?
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 36 }}
                >
                  Abbrechen
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function miniBtn(C: Palette, color: string): React.CSSProperties {
  return {
    fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase",
    color, background: "none", border: `1px solid ${color}`,
    padding: "0.3rem 0.5rem", cursor: "pointer", minHeight: 30, borderRadius: 3,
  };
}

function Stat({ label, value, C }: { label: string; value: number; C: Palette }) {
  return (
    <div style={{ padding: "0.5rem 0.7rem", background: C.deep, border: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: SERIF, fontSize: "1.5rem", color: C.textBright, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginTop: "0.2rem" }}>{label}</div>
    </div>
  );
}
