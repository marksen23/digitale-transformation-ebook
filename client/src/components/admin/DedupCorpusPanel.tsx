/**
 * DedupCorpusPanel — Admin-UI für POST /api/admin/dedup-corpus (Batch 5a).
 *
 * Portiert scripts/dedup-corpus.ts (CLI, weiterhin nutzbar) als Panel: Vorschau
 * gruppiert exakte Dubletten (gleicher endpoint+anchor+normalisierte Frage),
 * zeigt je Gruppe den Keeper (bester Status, sonst ältester) hervorgehoben,
 * "Bereinigen" löscht den Rest — hinter Zwei-Klick-Bestätigung wie
 * ActionLogPanel.confirmClear, da destruktiv gegen den echten Korpus.
 */
import { useState } from "react";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";
import { callAdminAction } from "@/lib/adminAuth";
import { recordAction } from "@/lib/adminActionLog";

interface DedupCandidate {
  id: string; endpoint: string; anchor: string; promptPreview: string; status: string; keeperId: string;
}
interface DedupPreviewResponse {
  ok: boolean; mode: string;
  totalEntries: number; duplicateGroups: number;
  toDelete: DedupCandidate[]; byEndpoint: Record<string, number>;
}
interface DedupApplyResponse extends DedupPreviewResponse {
  deleted: number; failed: number;
}

export default function DedupCorpusPanel({ C }: { C: Palette }) {
  const [rawOnly, setRawOnly] = useState(false);
  const [preview, setPreview] = useState<DedupPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    setApplyMsg(null);
    const r = await callAdminAction<DedupPreviewResponse>("dedup-corpus", { mode: "preview", rawOnly });
    setLoading(false);
    if (r.ok && r.data) setPreview(r.data);
    else setError(r.error ?? "Vorschau fehlgeschlagen");
  }

  async function handleApply() {
    if (!preview || preview.toDelete.length === 0) return;
    setApplying(true);
    setConfirmApply(false);
    const r = await callAdminAction<DedupApplyResponse>("dedup-corpus", { mode: "apply", rawOnly });
    recordAction({
      type: "dedup-corpus", targetCount: preview.toDelete.length, ok: r.ok,
      reason: r.ok ? undefined : r.error,
      payload: { rawOnly, deleted: r.data?.deleted },
    });
    setApplying(false);
    if (r.ok && r.data) {
      setApplyMsg(`${r.data.deleted} Dublette(n) gelöscht${r.data.failed ? `, ${r.data.failed} fehlgeschlagen` : ""}.`);
      setPreview(null);
    } else {
      setApplyMsg(`Fehler: ${r.error ?? "unbekannt"}`);
    }
  }

  const groupedByKeeper = preview
    ? Array.from(new Map(preview.toDelete.map(c => [c.keeperId, preview.toDelete.filter(x => x.keeperId === c.keeperId)])))
    : [];

  return (
    <section style={{ marginBottom: "1.5rem", border: `1px solid ${C.border}`, borderRadius: 6, padding: "1rem 1.1rem", background: C.surface }}>
      <SectionLabel c={C} size="sm" tracking="open" variant="arbeit">Exakte Dubletten</SectionLabel>
      <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim, lineHeight: 1.5 }}>
        Gruppiert Einträge mit gleichem Endpoint, Anker und normalisierter Frage — Nachzügler
        aus der Zeit vor dem Ingest-Dedup. Je Gruppe bleibt der beste Eintrag (kuratiert vor
        roh, sonst der älteste); der Rest wird gelöscht. Entspricht{" "}
        <code style={{ fontFamily: MONO, color: C.accentText }}>scripts/dedup-corpus.ts</code>.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontFamily: MONO, fontSize: "0.58rem", color: C.textDim, cursor: "pointer" }}>
          <input type="checkbox" checked={rawOnly} onChange={e => setRawOnly(e.target.checked)} />
          nur rohe Dubletten (kuratierte nicht anfassen)
        </label>
        <button
          onClick={() => void loadPreview()}
          disabled={loading}
          style={{
            fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
            color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 3,
            padding: "0.4rem 0.7rem", cursor: loading ? "default" : "pointer", minHeight: 34,
          }}
        >
          {loading ? "lädt …" : "Vorschau laden"}
        </button>
      </div>

      {error && <p style={{ marginTop: "0.6rem", fontFamily: MONO, fontSize: "0.55rem", color: "#c48282" }}>{error}</p>}

      {preview && (
        <>
          <div style={{ marginTop: "0.9rem", fontFamily: MONO, fontSize: "0.55rem", color: C.muted, letterSpacing: "0.04em" }}>
            {preview.totalEntries} Einträge · {preview.duplicateGroups} Dubletten-Gruppen · {preview.toDelete.length} zu löschen
            {Object.keys(preview.byEndpoint).length > 0 && (
              <> — {Object.entries(preview.byEndpoint).map(([ep, n]) => `${ep}=${n}`).join(" · ")}</>
            )}
          </div>

          {preview.toDelete.length === 0 ? (
            <p style={{ marginTop: "0.6rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem", color: C.muted }}>
              Keine exakten Dubletten gefunden{rawOnly ? " (unter den rohen Einträgen)" : ""}.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.8rem" }}>
              {groupedByKeeper.map(([keeperId, dupes]) => (
                <div key={keeperId} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.6rem 0.75rem", background: C.deep }}>
                  <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: "#7ab898", marginBottom: "0.35rem" }}>
                    ✓ Keeper: {keeperId} · {dupes[0].endpoint} · {dupes[0].anchor}
                  </div>
                  {dupes.map(d => (
                    <div key={d.id} style={{ fontFamily: SERIF, fontSize: "0.78rem", color: C.textDim, lineHeight: 1.4, paddingLeft: "0.8rem" }}>
                      ✕ {d.id} <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted }}>({d.status})</span> — „{d.promptPreview}{d.promptPreview.length >= 100 ? "…" : ""}"
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {preview.toDelete.length > 0 && (
            <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              {confirmApply ? (
                <>
                  <button
                    onClick={() => void handleApply()}
                    disabled={applying}
                    style={{
                      fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      color: "#fff", background: "#c48282", border: "1px solid #c48282", borderRadius: 3,
                      padding: "0.4rem 0.7rem", cursor: applying ? "default" : "pointer", minHeight: 34,
                    }}
                  >
                    {applying ? "bereinigt …" : `Wirklich ${preview.toDelete.length} löschen?`}
                  </button>
                  <button
                    onClick={() => setConfirmApply(false)}
                    disabled={applying}
                    style={{
                      fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 3,
                      padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 34,
                    }}
                  >
                    Abbrechen
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmApply(true)}
                  style={{
                    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                    color: C.void, background: "#c48282", border: "1px solid #c48282", borderRadius: 3,
                    padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 34,
                  }}
                >
                  Bereinigen
                </button>
              )}
            </div>
          )}
        </>
      )}

      {applyMsg && (
        <p style={{ marginTop: "0.7rem", fontFamily: MONO, fontSize: "0.55rem", color: applyMsg.startsWith("Fehler") ? "#c48282" : "#7ab898" }}>
          {applyMsg}
        </p>
      )}
    </section>
  );
}
