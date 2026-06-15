/**
 * StatistikPage (/statistik) — öffentliche Live-Statistik des Korpus.
 * Reicher als /status: Verteilungen nach Bereich, Status, Zeit (Monate),
 * meistberührte Begriffe, Echo-/Novelty-Anteil und mittlere Werkstreue.
 * Alles live aus dem Index, ohne Admin-Token. Aktualisiert auf das
 * resonanzen-index-stale-Event.
 */
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, type Palette } from "@/lib/theme";
import { loadResonanzenIndexLazy, ENDPOINT_LABEL, type ResonanzIndex, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { NODES } from "@/data/conceptGraph";
import SiteFooter from "@/components/SiteFooter";

const NODE_LABEL = new Map(NODES.map(n => [n.id, n.fullLabel]));
const STATUS_LABEL: Record<string, string> = {
  published: "veröffentlicht", approved: "freigegeben", raw: "roh", pending: "ausstehend", rejected: "abgelehnt",
};

export default function StatistikPage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [index, setIndex] = useState<ResonanzIndex | null>(null);

  useEffect(() => {
    const load = () => loadResonanzenIndexLazy().then(idx => { if (idx) setIndex(idx); });
    load();
    window.addEventListener("resonanzen-index-stale", load);
    return () => window.removeEventListener("resonanzen-index-stale", load);
  }, []);

  const s = useMemo(() => {
    const e: ResonanzEntry[] = index?.entries ?? [];
    const byEndpoint: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const byConcept: Record<string, number> = {};
    let echoes = 0, novelty = 0, voiceSum = 0, voiceN = 0;
    for (const x of e) {
      byEndpoint[x.endpoint] = (byEndpoint[x.endpoint] ?? 0) + 1;
      byStatus[x.status] = (byStatus[x.status] ?? 0) + 1;
      const m = (x.ts ?? "").slice(0, 7); // YYYY-MM
      if (m) byMonth[m] = (byMonth[m] ?? 0) + 1;
      for (const nid of x.nodeIds ?? []) byConcept[nid] = (byConcept[nid] ?? 0) + 1;
      if (x.nearDuplicates && x.nearDuplicates.length > 0) echoes++;
      if (x.novelty) novelty++;
      if (typeof x.corpusVoiceScore === "number") { voiceSum += x.corpusVoiceScore; voiceN++; }
    }
    const months = Object.keys(byMonth).sort().slice(-12);
    const topConcepts = Object.entries(byConcept).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      total: e.length,
      curated: (byStatus.approved ?? 0) + (byStatus.published ?? 0),
      byEndpoint: Object.entries(byEndpoint).sort((a, b) => b[1] - a[1]),
      byStatus: Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
      months: months.map(m => [m, byMonth[m]] as [string, number]),
      topConcepts,
      echoes, novelty,
      avgVoice: voiceN > 0 ? voiceSum / voiceN : null,
    };
  }, [index]);

  const card: React.CSSProperties = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, padding: "1rem 1.2rem", marginBottom: "1.2rem" };
  const label: React.CSSProperties = { fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase", color: c.muted, marginBottom: "0.7rem" };

  function Bars({ rows, color }: { rows: [string, number][]; color?: (k: string) => string }) {
    const max = Math.max(1, ...rows.map(r => r[1]));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {rows.map(([k, n]) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 32%) 1fr auto", gap: "0.6rem", alignItems: "center" }}>
            <span style={{ fontFamily: SERIF, fontSize: "0.82rem", color: c.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
            <span style={{ height: 8, background: c.deep, borderRadius: 4, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(n / max) * 100}%`, background: color ? color(k) : c.accentText, borderRadius: 4 }} />
            </span>
            <span style={{ fontFamily: MONO, fontSize: "0.8rem", color: c.text }}>{n}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", background: c.void, color: c.text,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 0" }}>
        <div style={label}>Resonanzvernunft · Live-Daten</div>
        <h1 style={{ margin: "0 0 1.2rem", fontFamily: SERIF, fontSize: "1.9rem", color: c.textBright, lineHeight: 1.2 }}>Statistik</h1>

        {!index ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>lädt …</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1.2rem" }}>
              {[
                { l: "Begegnungen", v: s.total, accent: true },
                { l: "kuratiert", v: s.curated },
                { l: "Echos", v: s.echoes },
                { l: "Novelty", v: s.novelty },
                { l: "Ø Werkstreue", v: s.avgVoice !== null ? s.avgVoice.toFixed(2) : "—" },
              ].map(k => (
                <div key={k.l} style={{ ...card, flex: 1, minWidth: 120, marginBottom: 0 }}>
                  <div style={label}>{k.l}</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.6rem", color: k.accent ? c.accentText : c.text }}>{k.v}</div>
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={label}>Nach Bereich</div>
              <Bars rows={s.byEndpoint.map(([ep, n]) => [ENDPOINT_LABEL[ep as ResonanzEntry["endpoint"]] ?? ep, n])}
                    color={() => c.accentText} />
            </div>

            <div style={card}>
              <div style={label}>Nach Kuratierungsstatus</div>
              <Bars rows={s.byStatus.map(([st, n]) => [STATUS_LABEL[st] ?? st, n])} />
            </div>

            <div style={card}>
              <div style={label}>Wachstum nach Monat (letzte 12)</div>
              <Bars rows={s.months} />
            </div>

            <div style={card}>
              <div style={label}>Meistberührte Begriffe</div>
              {s.topConcepts.length === 0 ? (
                <span style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>—</span>
              ) : (
                <Bars rows={s.topConcepts.map(([id, n]) => [NODE_LABEL.get(id) ?? id, n])} />
              )}
            </div>

            <div style={{ fontFamily: MONO, fontSize: "0.65rem", color: c.muted, marginTop: "0.5rem" }}>
              Stand: {new Date(index.generatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
              {" · "}live aus dem Korpus-Index
            </div>
          </>
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
