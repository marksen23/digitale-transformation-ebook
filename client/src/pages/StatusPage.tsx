/**
 * StatusPage (/status) — öffentlicher, token-freier Status des Korpus.
 * Zeigt Gesamt-Begegnungen, Verteilung nach Bereich + Kuratierungsstatus und
 * den Zeitpunkt des letzten vollständigen Builds (generatedAt).
 *
 * Bewusst KEIN Admin-Token (im Gegensatz zu /admin/health) — das ist die
 * öffentliche „läuft / wie groß / wie frisch"-Sicht.
 */
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, type Palette } from "@/lib/theme";
import { loadResonanzenIndexLazy, ENDPOINT_LABEL, type ResonanzIndex, type ResonanzEntry } from "@/lib/resonanzenIndex";
import SiteFooter from "@/components/SiteFooter";

const STATUS_LABEL: Record<string, string> = {
  published: "veröffentlicht", approved: "freigegeben", raw: "roh", pending: "ausstehend", rejected: "abgelehnt",
};

export default function StatusPage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [index, setIndex] = useState<ResonanzIndex | null>(null);

  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => { if (idx) setIndex(idx); });
    const onStale = () => loadResonanzenIndexLazy().then(idx => { if (idx) setIndex(idx); });
    window.addEventListener("resonanzen-index-stale", onStale);
    return () => window.removeEventListener("resonanzen-index-stale", onStale);
  }, []);

  const stats = useMemo(() => {
    const entries: ResonanzEntry[] = index?.entries ?? [];
    const byEndpoint: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const e of entries) {
      byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] ?? 0) + 1;
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    }
    const curated = (byStatus.approved ?? 0) + (byStatus.published ?? 0);
    return { total: entries.length, byEndpoint, byStatus, curated };
  }, [index]);

  const card: React.CSSProperties = {
    background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, padding: "1rem 1.2rem",
  };
  const label: React.CSSProperties = {
    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase", color: c.muted,
  };

  function Row({ name, n }: { name: string; n: number }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.3rem 0", borderBottom: `1px solid ${c.border}` }}>
        <span style={{ fontFamily: SERIF, fontSize: "0.9rem", color: c.textDim }}>{name}</span>
        <span style={{ fontFamily: MONO, fontSize: "0.95rem", color: c.text }}>{n}</span>
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
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem 0" }}>
        <div style={label}>Resonanzvernunft · Öffentlicher Status</div>
        <h1 style={{ margin: "0.4rem 0 1.5rem", fontFamily: SERIF, fontSize: "1.9rem", color: c.textBright, lineHeight: 1.2 }}>Status</h1>

        {!index ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>lädt …</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ ...card, flex: 1, minWidth: 150 }}>
                <div style={label}>Begegnungen gesamt</div>
                <div style={{ fontFamily: MONO, fontSize: "2rem", color: c.accentText, marginTop: "0.3rem" }}>{stats.total}</div>
              </div>
              <div style={{ ...card, flex: 1, minWidth: 150 }}>
                <div style={label}>davon kuratiert</div>
                <div style={{ fontFamily: MONO, fontSize: "2rem", color: c.text, marginTop: "0.3rem" }}>{stats.curated}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ ...card, flex: 1, minWidth: 240 }}>
                <div style={{ ...label, marginBottom: "0.5rem" }}>Nach Bereich</div>
                {Object.entries(stats.byEndpoint).sort((a, b) => b[1] - a[1]).map(([ep, n]) => (
                  <Row key={ep} name={ENDPOINT_LABEL[ep as ResonanzEntry["endpoint"]] ?? ep} n={n} />
                ))}
              </div>
              <div style={{ ...card, flex: 1, minWidth: 240 }}>
                <div style={{ ...label, marginBottom: "0.5rem" }}>Nach Kuratierungsstatus</div>
                {Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]).map(([st, n]) => (
                  <Row key={st} name={STATUS_LABEL[st] ?? st} n={n} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: "1.5rem", fontFamily: MONO, fontSize: "0.65rem", color: c.muted }}>
              Letzter vollständiger Build:{" "}
              {new Date(index.generatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </>
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
