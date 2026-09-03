/**
 * MobileBetrieb — Reader-first-Design, Bereich "Betrieb": vier Reiter
 * (Kuration/Metrics/Health/Status), gerahmt wie die übrigen Mobile-Screens.
 * Kuration/Metrics/Health sind token-gated (echter useAdminAuth()-Gate,
 * kein separates Login-Formular — die App hat nur den ?token=-Weg);
 * Status bleibt öffentlich, exakt wie im echten Routing. Reiter-Wechsel
 * navigiert echte Routen (/admin, /admin/metrics, /admin/health, /status),
 * keine simulierte In-Memory-Tab-Maschine.
 */
import { useEffect, useState } from "react";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import { loadResonanzenIndexLazy, broadcastIndexStale, ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry, type ResonanzIndex } from "@/lib/resonanzenIndex";
import { callAdminAction } from "@/lib/adminAuth";
import { recordAction } from "@/lib/adminActionLog";
import MobileScreenShell from "@/pages/mobile/MobileScreenShell";
import MobilePill from "@/pages/mobile/MobilePill";
import MobileStatTile from "@/pages/mobile/MobileStatTile";
import MobileBetriebMetrics from "@/pages/mobile/MobileBetriebMetrics";
import MobileBetriebHealth from "@/pages/mobile/MobileBetriebHealth";

export type BetriebTab = "kur" | "met" | "health" | "status";

const STATUS_LABEL: Record<string, string> = {
  published: "veröffentlicht", approved: "freigegeben", raw: "roh", pending: "ausstehend", rejected: "abgelehnt",
};
const epLabel = (ep: string) => ENDPOINT_LABEL[ep as ResonanzEntry["endpoint"]] ?? ep;

interface Props {
  C: Palette;
  isDark: boolean;
  activeTab: BetriebTab;
  onTabChange: (tab: BetriebTab) => void;
  onBack?: () => void;
}

export default function MobileBetrieb({ C, isDark, activeTab, onTabChange, onBack }: Props) {
  const [index, setIndex] = useState<ResonanzIndex | null>(null);

  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => { if (idx) setIndex(idx); });
    const onStale = () => loadResonanzenIndexLazy().then(idx => { if (idx) setIndex(idx); });
    window.addEventListener("resonanzen-index-stale", onStale);
    return () => window.removeEventListener("resonanzen-index-stale", onStale);
  }, []);

  const tabs: Array<[BetriebTab, string]> = [["kur", "Kuration"], ["met", "Metrics"], ["health", "Health"], ["status", "Status"]];

  return (
    <MobileScreenShell
      C={C} title="Betrieb" onBack={onBack} isDark={isDark}
      meta={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7a9a82", display: "inline-block" }} />OK</span>}
    >
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 4, margin: "0 -18px", padding: "0 18px 10px" }}>
        {tabs.map(([id, label]) => (
          <MobilePill key={id} C={C} label={label} active={activeTab === id} onClick={() => onTabChange(id)} />
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "0 -18px", padding: "14px 18px 0" }}>
        {activeTab === "kur" && <Kuration C={C} index={index} setIndex={setIndex} />}
        {activeTab === "met" && <MobileBetriebMetrics C={C} index={index} />}
        {activeTab === "health" && <MobileBetriebHealth C={C} />}
        {activeTab === "status" && <StatusTab C={C} index={index} />}
      </div>
    </MobileScreenShell>
  );
}

// ─── Status (öffentlich) ───────────────────────────────────────────────────

function StatusTab({ C, index }: { C: Palette; index: ResonanzIndex | null }) {
  if (!index) return <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>;

  const byEndpoint: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const e of index.entries) {
    byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] ?? 0) + 1;
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  }
  const curated = (byStatus.approved ?? 0) + (byStatus.published ?? 0);

  const Row = ({ name, n }: { name: string; n: number }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: SERIF, fontSize: 13.5, color: C.textDim }}>{name}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, color: C.text, fontVariantNumeric: "tabular-nums" }}>{n}</span>
    </div>
  );

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>Resonanzvernunft · Öffentlicher Status</div>
      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 30, lineHeight: 1.15, color: C.textBright, marginBottom: 16 }}>Status</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 20 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "13px 14px" }}>
          <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>Begegnungen gesamt</div>
          <div style={{ fontFamily: MONO, fontSize: 28, color: C.accentText, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{index.entries.length}</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "13px 14px" }}>
          <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>davon kuratiert</div>
          <div style={{ fontFamily: MONO, fontSize: 28, color: C.text, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{curated}</div>
        </div>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "13px 14px", marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>Nach Bereich</div>
        {Object.entries(byEndpoint).sort((a, b) => b[1] - a[1]).map(([ep, n]) => <Row key={ep} name={epLabel(ep)} n={n} />)}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "13px 14px" }}>
        <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>Nach Kuratierungsstatus</div>
        {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([st, n]) => <Row key={st} name={STATUS_LABEL[st] ?? st} n={n} />)}
      </div>
      <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 10, color: C.muted }}>
        Letzter vollständiger Build: {new Date(index.generatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
      </div>
    </div>
  );
}

// ─── Kuration (token-gated) ─────────────────────────────────────────────────

interface AutoCurateApplyResponse {
  counts: { approve: number; reject: number; review: number };
}

function Kuration({ C, index, setIndex }: { C: Palette; index: ResonanzIndex | null; setIndex: (fn: (curr: ResonanzIndex | null) => ResonanzIndex | null) => void }) {
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [autoCurating, setAutoCurating] = useState(false);
  const [autoCurateMsg, setAutoCurateMsg] = useState<string | null>(null);

  async function curate(id: string, newStatus: string) {
    setLoading(s => new Set(s).add(id));
    const result = await callAdminAction("curate", { id, status: newStatus });
    setLoading(s => { const n = new Set(s); n.delete(id); return n; });
    // F1-Parität mit Desktop (AdminCurationPage.tsx): jede Mutation ins
    // persistente Audit-Log — sonst fehlen mobile Kurations-Entscheidungen
    // im Aktions-Protokoll, das Admins am Rechner einsehen.
    recordAction({
      type: "curate", targetId: id, ok: result.ok,
      reason: result.ok ? undefined : (result.error ?? "Unbekannter Fehler"),
      payload: { newStatus },
    });
    if (result.ok) {
      setIndex(curr => curr ? { ...curr, entries: curr.entries.map(e => e.id === id ? { ...e, status: newStatus as ResonanzEntry["status"] } : e) } : curr);
      broadcastIndexStale();
    }
  }

  async function deleteEntry(id: string) {
    setConfirmDeleteId(null);
    setLoading(s => new Set(s).add(id));
    const result = await callAdminAction("delete", { id });
    setLoading(s => { const n = new Set(s); n.delete(id); return n; });
    recordAction({
      type: "delete", targetId: id, ok: result.ok,
      reason: result.ok ? undefined : (result.error ?? "Unbekannter Fehler"),
    });
    if (result.ok) {
      setIndex(curr => curr ? { ...curr, entries: curr.entries.filter(e => e.id !== id) } : curr);
      broadcastIndexStale();
    }
  }

  async function autoCurate() {
    setAutoCurating(true);
    setAutoCurateMsg(null);
    const result = await callAdminAction<AutoCurateApplyResponse>("auto-curate", { mode: "apply", limit: 50 });
    recordAction({
      type: "auto-curate", ok: result.ok,
      reason: result.ok ? undefined : (result.error ?? "Unbekannter Fehler"),
      payload: result.data?.counts,
    });
    setAutoCurating(false);
    if (result.ok && result.data) {
      const { approve, reject, review } = result.data.counts;
      setAutoCurateMsg(`${approve} freigegeben · ${reject} abgelehnt · ${review} zur Prüfung.`);
      broadcastIndexStale();
      loadResonanzenIndexLazy().then(idx => { if (idx) setIndex(() => idx); });
    } else {
      setAutoCurateMsg(`Fehler: ${result.error ?? "unbekannt"}`);
    }
  }

  if (!index) return <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>;

  // Warteschlange = noch nicht final entschiedene Einträge (roh/ausstehend),
  // neueste zuerst, gedeckelt — derselbe „kein endloses Scrollen"-Gedanke
  // wie beim Live-Feed in Metrics.
  const queue = index.entries
    .filter(e => e.status === "raw" || e.status === "pending")
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 20);

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, color: C.textDim }}>
          {queue.length === 0 ? "Die Warteschlange ist leer." : queue.length === 1 ? "1 Begegnung wartet auf Entscheidung." : `${queue.length} Begegnungen warten auf Entscheidung.`}
        </div>
        <button type="button" disabled={autoCurating} onClick={() => void autoCurate()}
          style={{ minHeight: 34, padding: "0 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.accentText, fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", cursor: autoCurating ? "wait" : "pointer", opacity: autoCurating ? 0.6 : 1, whiteSpace: "nowrap" }}
        >{autoCurating ? "läuft …" : "Automatisch kuratieren"}</button>
      </div>
      {autoCurateMsg && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: autoCurateMsg.startsWith("Fehler") ? "#c48282" : "#7ab898", marginBottom: 12 }}>
          {autoCurateMsg}
        </div>
      )}
      {queue.map(q => {
        const isLoading = loading.has(q.id);
        const confirmingDelete = confirmDeleteId === q.id;
        return (
          <div key={q.id} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 13, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: ENDPOINT_COLOR[q.endpoint] ?? C.muted }}>{epLabel(q.endpoint)}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>{STATUS_LABEL[q.status] ?? q.status}</span>
            </div>
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: C.textBright, marginBottom: 10 }}>
              {q.prompt.slice(0, 140)}{q.prompt.length > 140 ? "…" : ""}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: confirmingDelete ? 8 : 0 }}>
              <button type="button" disabled={isLoading} onClick={() => void curate(q.id, "approved")}
                style={{ flex: 1, minHeight: 42, background: "transparent", border: `1px solid ${C.accentText}`, borderRadius: 4, color: C.accentText, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: isLoading ? "wait" : "pointer", opacity: isLoading ? 0.6 : 1 }}
              >Freigeben</button>
              <button type="button" disabled={isLoading} onClick={() => void curate(q.id, "published")}
                style={{ flex: 1, minHeight: 42, background: "transparent", border: "1px solid #7ab898", borderRadius: 4, color: "#7ab898", fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: isLoading ? "wait" : "pointer", opacity: isLoading ? 0.6 : 1 }}
              >Veröffentl.</button>
              <button type="button" disabled={isLoading} onClick={() => void curate(q.id, "rejected")}
                style={{ minHeight: 42, padding: "0 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.textDim, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: isLoading ? "wait" : "pointer", opacity: isLoading ? 0.6 : 1 }}
              >Verwerfen</button>
              <button type="button" disabled={isLoading} onClick={() => setConfirmDeleteId(q.id)}
                style={{ minHeight: 42, padding: "0 12px", background: "transparent", border: "1px solid #c48282", borderRadius: 4, color: "#c48282", fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: isLoading ? "wait" : "pointer", opacity: isLoading ? 0.6 : 1 }}
              >✕</button>
            </div>
            {confirmingDelete && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: "#c48282", flex: 1 }}>Eintrag wirklich löschen?</span>
                <button type="button" onClick={() => void deleteEntry(q.id)}
                  style={{ minHeight: 34, padding: "0 12px", background: "#c48282", border: "1px solid #c48282", borderRadius: 4, color: "#fff", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
                >Löschen</button>
                <button type="button" onClick={() => setConfirmDeleteId(null)}
                  style={{ minHeight: 34, padding: "0 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
                >Abbrechen</button>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <MobileStatTile C={C} value={String(index.entries.length)} label="Begegnungen gesamt" />
      </div>
    </div>
  );
}
