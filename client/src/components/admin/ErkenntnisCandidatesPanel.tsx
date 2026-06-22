/**
 * ErkenntnisCandidatesPanel — Admin-UI für die Erkenntnisse-Phase 2.
 *
 * Listet die build-präkomputierten Erkenntnis-Kandidaten (Antworten, die offene
 * Schlussfragen lösen + distinkt zum Kanon sind). Pro Kandidat: „Kernsatz
 * destillieren" (KI-Entwurf via /api/admin/distill-erkenntnis) → editieren →
 * „Als Erkenntnis bestätigen" (/api/admin/confirm-erkenntnis, persistiert).
 * Tragendes Prinzip: Automatik schlägt vor + liefert Provenienz, Mensch autorisiert.
 */
import { useEffect, useState } from "react";
import { loadErkenntnisCandidates, invalidateErkenntnisCandidates, type ErkenntnisCandidate } from "@/lib/erkenntnisCandidates";
import { callAdminAction } from "@/lib/adminAuth";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";

const SITE_RESONANZ = (id: string) => `/resonanz/${encodeURIComponent(id)}`;

function ErkenntnisRow({ C, cand, onConfirmed }: {
  C: Palette; cand: ErkenntnisCandidate; onConfirmed: (id: string) => void;
}) {
  const [kernsatz, setKernsatz] = useState("");
  const [busy, setBusy] = useState<"distill" | "confirm" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const distill = async () => {
    setBusy("distill"); setMsg(null);
    const r = await callAdminAction<{ kernsatz?: string }>("distill-erkenntnis", { answerId: cand.answerId });
    setBusy(null);
    if (r.ok && r.data?.kernsatz) setKernsatz(r.data.kernsatz);
    else setMsg(`Destillation fehlgeschlagen: ${r.error ?? "?"}`);
  };
  const confirm = async () => {
    setBusy("confirm"); setMsg(null);
    const r = await callAdminAction("confirm-erkenntnis", {
      id: cand.id, kernsatz: kernsatz.trim(), answerId: cand.answerId,
      questionSourceId: cand.resolves[0]?.sourceId, conceptAnchor: cand.conceptAnchor,
      distinctness: cand.distinctness,
    });
    setBusy(null);
    if (r.ok) { invalidateErkenntnisCandidates(); onConfirmed(cand.id); }
    else setMsg(`Bestätigung fehlgeschlagen: ${r.error ?? "?"}`);
  };

  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem",
    color: C.text, background: C.deep, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0.4rem 0.55rem", outline: "none",
  };
  const btn = (primary: boolean): React.CSSProperties => ({
    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
    color: primary ? C.void : C.accentText, background: primary ? C.accent : "none",
    border: `1px solid ${primary ? C.accent : C.border}`, borderRadius: 3, padding: "0.4rem 0.7rem",
    cursor: "pointer", minHeight: 34,
  });

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.75rem 0.9rem", background: C.deep }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.06em", color: C.muted }}>
          Distinktheit {cand.distinctness.toFixed(2)} · löst {cand.resolveCount} Frage{cand.resolveCount === 1 ? "" : "n"}
          {cand.conceptAnchor ? <> · nah an <span style={{ color: C.accentText }}>{cand.conceptAnchor}</span></> : null}
          {" "}· <a href={SITE_RESONANZ(cand.answerId)} target="_blank" rel="noreferrer" style={{ color: C.accentText, textDecoration: "none" }}>Antwort ↗</a>
        </span>
        <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted }}>{cand.answerEndpoint} · {cand.answerStatus}</span>
      </div>

      {/* Entstehungsanalyse: welche offenen Fragen diese Antwort löst */}
      <div style={{ marginTop: "0.5rem", fontFamily: SERIF, fontSize: "0.8rem", color: C.textDim, lineHeight: 1.5 }}>
        <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>beantwortet</span>
        <ul style={{ margin: "0.25rem 0 0", padding: 0, listStyle: "none", display: "grid", gap: "0.2rem" }}>
          {cand.resolves.map(r => (
            <li key={r.sourceId}>
              <a href={SITE_RESONANZ(r.sourceId)} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: "none" }}>
                „{r.question.slice(0, 110)}{r.question.length > 110 ? "…" : ""}" <span style={{ color: C.muted }}>{r.score.toFixed(2)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: "0.5rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: C.muted, lineHeight: 1.45 }}>
        {cand.answerExcerpt.slice(0, 240)}…
      </div>

      <div style={{ marginTop: "0.6rem" }}>
        <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, display: "block", marginBottom: "0.25rem" }}>Kernsatz</span>
        <textarea value={kernsatz} onChange={e => setKernsatz(e.target.value)} rows={2}
          placeholder={'Kernsatz destillieren (Button) oder selbst formulieren — der eine neue Gedanke in einem Satz.'} style={{ ...input, resize: "vertical" }} />
      </div>

      {msg && <div style={{ marginTop: "0.4rem", fontFamily: MONO, fontSize: "0.55rem", color: "#c48282" }}>{msg}</div>}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <button onClick={distill} disabled={busy !== null} style={btn(false)}>
          {busy === "distill" ? "destilliert …" : "✦ Kernsatz destillieren"}
        </button>
        <button onClick={confirm} disabled={busy !== null || kernsatz.trim().length < 8} style={{ ...btn(true), opacity: kernsatz.trim().length < 8 ? 0.5 : 1 }}>
          {busy === "confirm" ? "bestätigt …" : "↑ Als Erkenntnis bestätigen"}
        </button>
      </div>
    </div>
  );
}

export default function ErkenntnisCandidatesPanel({ C }: { C: Palette }) {
  const [cands, setCands] = useState<ErkenntnisCandidate[] | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  useEffect(() => { loadErkenntnisCandidates().then(f => setCands(f?.candidates ?? [])); }, []);

  const visible = (cands ?? []).filter(c => !confirmed.has(c.id));

  return (
    <section style={{ marginBottom: "1.5rem", border: `1px solid ${C.border}`, borderRadius: 6, padding: "1rem 1.1rem", background: C.surface }}>
      <SectionLabel c={C} size="sm" tracking="open" variant="arbeit">Erkenntnis-Kandidaten (aus den Antwort-Ketten)</SectionLabel>
      <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim, lineHeight: 1.5 }}>
        Antworten, die offene Schlussfragen des Werks lösen und distinkt zum Kanon sind.
        Destilliere den Kernsatz (KI-Entwurf, du editierst) und verleih den Status „Erkenntnis" —
        die Decke bleibt deine Hand.
      </p>

      {!cands ? (
        <div style={{ marginTop: "0.8rem", fontFamily: MONO, fontSize: "0.6rem", color: C.muted }}>lädt …</div>
      ) : visible.length === 0 ? (
        <div style={{ marginTop: "0.8rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem", color: C.muted }}>
          Keine offenen Kandidaten — entweder noch nicht gebaut, oder alle distinkten Antworten bereits als Erkenntnis bestätigt.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.9rem" }}>
          {visible.map(c => (
            <ErkenntnisRow key={c.id} C={C} cand={c} onConfirmed={id => setConfirmed(prev => new Set(prev).add(id))} />
          ))}
        </div>
      )}
    </section>
  );
}
