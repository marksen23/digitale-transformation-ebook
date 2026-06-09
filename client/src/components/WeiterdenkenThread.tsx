/**
 * WeiterdenkenThread — macht die Schlussfrage einer KI-Ausgabe lebendig.
 *
 * Jede KI-Ausgabe im Werk endet mit einer offenen Frage. Diese Komponente
 * nimmt sie als Saatkorn und baut daraus einen rekursiven Faden:
 *
 *   Frage  →  [Selbst denken | KI weiterdenken]
 *               ├ Selbst denken  → Leser-Antwort  → KI von hier weiterdenken?
 *               └ KI weiterdenken → KI-Reflexion + NEUE Frage → (loop)
 *
 * Das verkörpert die Resonanzvernunft: Vernunft als fortlaufendes
 * Antwortgeschehen zwischen Selbst, Werk und Maschine.
 *
 * Persönlich (kein Konto): Engagement wird via trajectory.ts getrackt.
 * Die KI-Fortsetzung läuft über /api/weiterdenken (Werk-RAG + Korpus-Append).
 */
import { useMemo, useState } from "react";
import type { Palette } from "@/lib/theme";
import { MONO, SERIF } from "@/lib/theme";
import { track } from "@/lib/trajectory";
import CitedSourcesFooter, { type CitedSource } from "@/components/CitedSourcesFooter";
import { saveThread, type ThreadStep } from "@/lib/threadStore";
import { splitClosing } from "@/lib/closingQuestion";

type EntryKind = "frage" | "leser" | "ki";
interface Entry { kind: EntryKind; text: string; citedChunks?: CitedSource[] }

interface WeiterdenkenThreadProps {
  c: Palette;
  /** Die Schlussfrage der vorausgehenden KI-Ausgabe — das Saatkorn. */
  initialQuestion: string;
  /** Anchor-Fokus (z.B. nodeIds joined mit "+") für RAG + Korpus-Log. */
  focus?: string;
  focusedNodeIds?: string[];
  /** Resume: vorbestehende Schritte eines gespeicherten Fadens. */
  initialEntries?: Entry[];
  /** Resume: id des gespeicherten Fadens (Updates statt Duplikat). */
  threadId?: string;
}

export default function WeiterdenkenThread({ c, initialQuestion, focus, focusedNodeIds, initialEntries, threadId }: WeiterdenkenThreadProps) {
  const [entries, setEntries] = useState<Entry[]>(
    initialEntries && initialEntries.length > 0
      ? initialEntries
      : [{ kind: "frage", text: initialQuestion.trim() }],
  );
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(threadId ?? null);
  const [justSaved, setJustSaved] = useState(false);

  const last = entries[entries.length - 1];

  // Faden für die API: alle Einträge VOR der aktiven Frage, übersetzt.
  function buildThreadPayload(uptoIndex: number): Array<{ role: "frage" | "antwort"; text: string }> {
    return entries.slice(0, uptoIndex).map(e => ({
      role: e.kind === "frage" ? ("frage" as const) : ("antwort" as const),
      text: e.text,
    }));
  }

  /** Die letzte offene Frage im Faden (für KI-Fortsetzung). */
  const lastQuestionIdx = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].kind === "frage") return i;
    return -1;
  }, [entries]);

  async function kiWeiterdenken(userAnswer?: string) {
    if (lastQuestionIdx < 0 || loading) return;
    const question = entries[lastQuestionIdx].text;
    setLoading(true);
    setError(null);
    const body = JSON.stringify({
      question,
      thread: buildThreadPayload(lastQuestionIdx),
      focus, focusedNodeIds,
      ...(userAnswer ? { userAnswer } : {}),
    });

    // 1) Streaming (SSE) — Reflexion erscheint token-weise. Am Stream-Ende
    //    Client-seitig in Reflexion + Schlussfrage gespalten.
    let streamStarted = false;
    try {
      const res = await fetch("/api/weiterdenken/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      if (res.ok && res.body) {
        streamStarted = true;
        setEntries(prev => [...prev, { kind: "ki" as const, text: "" }]);  // Platzhalter (= letzter Eintrag)
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", acc = "";
        let cited: CitedSource[] = [];
        let streamError: string | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const json = t.slice(5).trim();
            if (!json) continue;
            try {
              const ev = JSON.parse(json) as { delta?: string; done?: boolean; citedChunks?: CitedSource[]; error?: string };
              if (typeof ev.delta === "string") {
                acc += ev.delta;
                setEntries(prev => { const c = [...prev]; c[c.length - 1] = { kind: "ki", text: acc, citedChunks: cited }; return c; });
              } else if (ev.done) {
                cited = Array.isArray(ev.citedChunks) ? ev.citedChunks : [];
              } else if (ev.error) {
                streamError = String(ev.error);
              }
            } catch { /* partieller Frame */ }
          }
        }
        const { reflection, nextQuestion } = splitClosing(acc);
        setEntries(prev => {
          const c = [...prev];
          c[c.length - 1] = { kind: "ki", text: reflection || acc || streamError || "(keine Reflexion)", citedChunks: cited };
          if (nextQuestion) c.push({ kind: "frage", text: nextQuestion });
          return c;
        });
        if (streamError && !acc) setError(streamError);
        setJustSaved(false);
        track({ type: "weiterdenken-step" });
      }
    } catch { streamStarted = false; }

    // 2) Fallback: nicht-gestreamter Endpoint (nur wenn Streaming nie startete)
    if (!streamStarted) {
      try {
        const res = await fetch("/api/weiterdenken", {
          method: "POST", headers: { "Content-Type": "application/json" }, body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data.error ?? `Fehler ${res.status}`); }
        else {
          const reflection = String(data.reflection ?? "").trim();
          const nextQuestion = String(data.nextQuestion ?? "").trim();
          const cited: CitedSource[] = Array.isArray(data.citedChunks) ? data.citedChunks : [];
          setEntries(prev => {
            const next: Entry[] = [...prev, { kind: "ki" as const, text: reflection || "(keine Reflexion)", citedChunks: cited }];
            if (nextQuestion) next.push({ kind: "frage", text: nextQuestion });
            return next;
          });
          setJustSaved(false);
          track({ type: "weiterdenken-step" });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    setLoading(false);
  }

  function selbstDenken() {
    const text = draft.trim();
    if (!text || lastQuestionIdx < 0) return;
    setEntries(prev => [...prev, { kind: "leser", text }]);
    setDraft("");
    setJustSaved(false);
    track({ type: "weiterdenken-step" });
  }

  /** Faden in „Mein Werk" sichern — fortsetzbar + wiederauffindbar. */
  function handleSave() {
    const steps: ThreadStep[] = entries.map(e => ({
      kind: e.kind,
      text: e.text,
      werkAnchors: (e.citedChunks ?? [])
        .filter(s => s.source !== "resonanz")
        .map(s => ({ chunkId: s.id, partTitle: s.partTitle, chapterTitle: s.chapterTitle })),
    }));
    const saved = saveThread({
      id: savedId ?? undefined,
      rootQuestion: initialQuestion.trim() || entries[0]?.text || "",
      steps,
      focus,
      focusedNodeIds,
    });
    setSavedId(saved.id);
    setJustSaved(true);
  }

  /** Faden hat mind. einen weitergesponnenen Schritt (nicht nur die Saat-Frage). */
  const hasProgress = entries.length > 1;

  return (
    <div style={{ marginTop: "0.9rem", paddingTop: "0.7rem", borderTop: `1px solid ${c.border}` }}>
      <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.accent, marginBottom: "0.55rem" }}>
        ⥁ Weiterdenken
      </div>

      {/* Faden — alle Einträge außer der jeweils aktiven Frage am Ende */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {entries.map((e, i) => {
          const isActiveQuestion = i === entries.length - 1 && e.kind === "frage";
          if (e.kind === "frage") {
            return (
              <div key={i} style={{
                fontFamily: SERIF, fontStyle: "italic",
                fontSize: isActiveQuestion ? "0.84rem" : "0.78rem",
                color: isActiveQuestion ? c.textBright : c.textDim,
                lineHeight: 1.5,
                paddingLeft: "0.6rem",
                borderLeft: `2px solid ${isActiveQuestion ? c.accent : c.accentDim}`,
              }}>
                {e.text}
              </div>
            );
          }
          // Antworten — Leser vs. KI visuell unterscheiden
          const isLeser = e.kind === "leser";
          return (
            <div key={i} style={{ paddingLeft: "0.6rem" }}>
              <div style={{ fontFamily: MONO, fontSize: "0.46rem", letterSpacing: "0.12em", textTransform: "uppercase", color: isLeser ? "#7ab898" : c.muted, marginBottom: "0.2rem" }}>
                {isLeser ? "◇ Du" : "◈ Weitergedacht"}
              </div>
              {e.text.split(/\n\n+/).map((para, pi) => (
                <p key={pi} style={{ fontFamily: SERIF, fontSize: "0.76rem", color: c.text, lineHeight: 1.6, margin: "0 0 0.4rem" }}>
                  {para.trim()}
                </p>
              ))}
              {!isLeser && e.citedChunks && e.citedChunks.length > 0 && (
                <CitedSourcesFooter sources={e.citedChunks} c={c} />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.55rem", color: "#c48282" }}>{error}</div>
      )}

      {/* Aktionsbereich — abhängig vom letzten Eintrag */}
      <div style={{ marginTop: "0.7rem" }}>
        {loading ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.74rem", color: c.muted }}>… wird weitergedacht</div>
        ) : last.kind === "frage" ? (
          <>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Selbst weiterdenken — deine Antwort …"
              rows={2}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem",
                color: c.textBright, background: c.surface,
                border: `1px solid ${draft ? c.accentDim : c.border}`,
                borderRadius: 4, padding: "0.5rem 0.6rem", outline: "none", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
              <button
                onClick={selbstDenken}
                disabled={!draft.trim()}
                style={actionBtn(c, draft.trim() ? "#7ab898" : c.muted, false)}
              >
                ◇ Selbst denken
              </button>
              <button onClick={() => kiWeiterdenken()} style={actionBtn(c, c.accent, true)}>
                ◈ KI weiterdenken
              </button>
            </div>
          </>
        ) : last.kind === "leser" ? (
          <button onClick={() => kiWeiterdenken(last.text)} style={actionBtn(c, c.accent, true)}>
            ◈ KI von hier weiterdenken
          </button>
        ) : (
          // last.kind === "ki" ohne Folgefrage — Faden ist ausgeklungen
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.72rem", color: c.muted }}>
            Der Faden ist ausgeklungen. Schließe eine neue Analyse an, um weiterzudenken.
          </div>
        )}
      </div>

      {/* Faden sichern — wiederauffindbar + fortsetzbar in „Mein Werk". */}
      {hasProgress && (
        <div style={{ marginTop: "0.7rem", paddingTop: "0.5rem", borderTop: `1px dashed ${c.border}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={handleSave}
            style={{
              fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
              color: justSaved ? "#7ab898" : c.textDim,
              background: "none", border: `1px solid ${justSaved ? "#7ab898" : c.border}`,
              padding: "0.35rem 0.65rem", cursor: "pointer", minHeight: 30, borderRadius: 3,
            }}
            title={savedId ? "Gespeicherten Faden aktualisieren" : "Faden in Mein Werk sichern"}
          >
            {justSaved ? "✓ gesichert" : savedId ? "✦ aktualisieren" : "✦ Faden sichern"}
          </button>
          {justSaved && (
            <a href="/mein-werk" style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.7rem", color: c.accent, textDecoration: "underline", textDecorationStyle: "dotted" }}>
              in Mein Werk ansehen
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function actionBtn(c: Palette, color: string, filled: boolean): React.CSSProperties {
  return {
    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
    color: filled ? c.void : color,
    background: filled ? color : "none",
    border: `1px solid ${color}`,
    padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 32, borderRadius: 3,
  };
}
