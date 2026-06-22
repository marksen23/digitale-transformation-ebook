/**
 * ProposeConceptPanel — Admin-UI zum Vorschlagen neuer Begriffe (Phase 5c.4).
 *
 * Formular (id, Label, Definition, Kategorie, Anker-Begriff) → „Prüfen"
 * (mode=preview, zeigt das Schutzwall-Verdikt: Distinktheit + Korpus-Evidenz)
 * → „In den Kanon aufnehmen" (mode=accept). Reuse callAdminAction.
 */
import { useEffect, useMemo, useState } from "react";
import { NODES, CAT_LABEL, type NodeCategory } from "@/data/conceptGraph";
import { callAdminAction } from "@/lib/adminAuth";
import { invalidateDynamicNodes } from "@/lib/dynamicNodes";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";

interface Verdict {
  pass: boolean;
  distinctness: number;
  nearestConcept: string | null;
  nearestSim: number;
  evidence: number;
  reason: string;
}

const CATEGORIES = Object.keys(CAT_LABEL) as NodeCategory[];

/** Vorbefüllung aus einem Begriffs-Kandidaten (ConceptCandidatesPanel).
 *  Eine neue Objekt-Identität (z. B. via `nonce`) triggert das Übernehmen. */
export interface ConceptPrefill {
  id: string;
  fullLabel: string;
  description?: string;
  category?: NodeCategory;
  anchorId?: string;
  nonce: number;
}

export default function ProposeConceptPanel({ C, prefill }: { C: Palette; prefill?: ConceptPrefill | null }) {
  const [id, setId] = useState("");
  const [fullLabel, setFullLabel] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<NodeCategory>("relational");
  const [anchorId, setAnchorId] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState<"preview" | "accept" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Kandidat-Übernahme: setzt die mechanischen Felder (id/Label/Anker/Kategorie);
  // die Definition bleibt bewusst leer — der Mensch formuliert sie selbst
  // (Kern des 5c-Schutzwalls). nonce als dep, damit auch dasselbe Label erneut greift.
  useEffect(() => {
    if (!prefill) return;
    setId(prefill.id);
    setFullLabel(prefill.fullLabel);
    if (prefill.description !== undefined) setDescription(prefill.description);
    if (prefill.category) setCategory(prefill.category);
    if (prefill.anchorId) setAnchorId(prefill.anchorId);
    setVerdict(null);
    setMsg(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  const anchors = useMemo(
    () => [...NODES].sort((a, b) => a.fullLabel.localeCompare(b.fullLabel)),
    [],
  );

  const body = () => ({
    id: id.trim(), fullLabel: fullLabel.trim(), label: fullLabel.trim(),
    description: description.trim(), category, anchorId,
  });
  const canSubmit = id.trim() && fullLabel.trim() && description.trim().length > 10 && anchorId;

  async function run(mode: "preview" | "accept") {
    setLoading(mode);
    setMsg(null);
    const r = await callAdminAction<{ verdict?: Verdict; applied?: boolean; node?: { id: string } }>(
      "propose-concept", { mode, ...body() },
    );
    setLoading(null);
    if (r.ok && r.data) {
      if (r.data.verdict) setVerdict(r.data.verdict);
      if (mode === "accept" && r.data.applied) {
        setMsg(`„${fullLabel.trim()}" in den Kanon aufgenommen. Erscheint in Landkarte + Begriffsnetz.`);
        invalidateDynamicNodes();
        setId(""); setFullLabel(""); setDescription(""); setAnchorId(""); setVerdict(null);
      }
    } else {
      setMsg(`Fehler: ${r.error ?? "unbekannt"}`);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", fontFamily: SERIF, fontSize: "0.85rem",
    color: C.text, background: C.deep, border: `1px solid ${C.border}`, borderRadius: 3,
    padding: "0.4rem 0.55rem", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase",
    color: C.muted, marginBottom: "0.25rem", display: "block",
  };

  return (
    <section style={{ marginBottom: "1.5rem", border: `1px solid ${C.border}`, borderRadius: 6, padding: "1rem 1.1rem", background: C.surface }}>
      <SectionLabel c={C} size="sm" tracking="open" variant="arbeit">Neuer Begriff (Wortschöpfung)</SectionLabel>
      <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim, lineHeight: 1.5 }}>
        Lagert einen neuen Begriff ans Netz an (statische Begriffe bleiben unberührt). Schutzwall:
        muss distinkt zu bestehenden Begriffen + vom kuratierten Korpus getragen sein.
      </p>

      <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.8rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          <label><span style={labelStyle}>id (a-z, 0-9, -)</span><input value={id} onChange={e => setId(e.target.value)} placeholder="z.B. zwischenklang" style={inputStyle} /></label>
          <label><span style={labelStyle}>Voller Begriff</span><input value={fullLabel} onChange={e => setFullLabel(e.target.value)} placeholder="z.B. Zwischenklang" style={inputStyle} /></label>
        </div>
        <label><span style={labelStyle}>Definition</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Was meint dieser Begriff im Geist des Werks?" style={{ ...inputStyle, resize: "vertical", fontStyle: "italic" }} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          <label><span style={labelStyle}>Kategorie</span>
            <select value={category} onChange={e => setCategory(e.target.value as NodeCategory)} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </select>
          </label>
          <label><span style={labelStyle}>Anker-Begriff</span>
            <select value={anchorId} onChange={e => setAnchorId(e.target.value)} style={inputStyle}>
              <option value="">— wählen —</option>
              {anchors.map(n => <option key={n.id} value={n.id}>{n.fullLabel}</option>)}
            </select>
          </label>
        </div>
      </div>

      {verdict && (
        <div style={{ marginTop: "0.8rem", padding: "0.6rem 0.8rem", borderRadius: 4, background: verdict.pass ? "#7ab8981a" : "#c482821a", borderLeft: `3px solid ${verdict.pass ? "#7ab898" : "#c48282"}` }}>
          <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: verdict.pass ? "#7ab898" : "#c48282" }}>
            {verdict.pass ? "✓ Gate bestanden" : "✕ Gate nicht bestanden"}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: "0.82rem", color: C.text, marginTop: "0.3rem", lineHeight: 1.5 }}>
            Distinktheit {verdict.distinctness.toFixed(2)} (nächster: {verdict.nearestConcept ?? "—"} @ {verdict.nearestSim.toFixed(2)}) · Korpus-Evidenz {verdict.evidence}
            <span style={{ display: "block", fontStyle: "italic", color: C.textDim, marginTop: "0.2rem" }}>{verdict.reason}</span>
          </div>
        </div>
      )}

      {msg && <div style={{ marginTop: "0.7rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.text }}>{msg}</div>}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.9rem", flexWrap: "wrap" }}>
        <button onClick={() => void run("preview")} disabled={!canSubmit || loading !== null}
          style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.text, background: "none", border: `1px solid ${C.border}`, borderRadius: 3, padding: "0.45rem 0.8rem", cursor: canSubmit ? "pointer" : "default", opacity: canSubmit ? 1 : 0.5, minHeight: 34 }}>
          {loading === "preview" ? "prüft …" : "Prüfen"}
        </button>
        <button onClick={() => void run("accept")} disabled={!canSubmit || !verdict?.pass || loading !== null}
          style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: verdict?.pass ? C.void : C.muted, background: verdict?.pass ? C.accent : "none", border: `1px solid ${verdict?.pass ? C.accent : C.border}`, borderRadius: 3, padding: "0.45rem 0.8rem", cursor: verdict?.pass ? "pointer" : "default", opacity: verdict?.pass && loading === null ? 1 : 0.5, minHeight: 34 }}>
          {loading === "accept" ? "nimmt auf …" : "↑ In den Kanon aufnehmen"}
        </button>
      </div>
    </section>
  );
}
