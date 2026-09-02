/**
 * ErkundenPage (/erkunden) — gemeinsamer Einstieg für Begriffsnetz,
 * Landkarte und Philosophie (Redesign Phase 2, Teil 2).
 *
 * Die drei Seiten sind heute gleichrangige, unabhängige Navpunkte — nichts
 * erklärt, dass sie denselben Begriffsraum aus drei verschiedenen Blickwinkeln
 * zeigen (Struktur / Wachstum / Denker). Diese Seite ist die fehlende
 * Zwischenstation: drei Karten, jede mit einer echten Kennzahl aus den
 * tatsächlichen Datenquellen, die geradewegs auf die jeweilige Seite führen.
 * Keine neue Visualisierung — nur der Rahmen, der die drei einordnet.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, type Palette } from "@/lib/theme";
import SiteFooter from "@/components/SiteFooter";
import { NODES, EDGES } from "@/data/conceptGraph";
import { PHILOSOPHERS, TRADITIONS } from "@/data/philosophyMap";
import { loadResonanzenIndexLazy } from "@/lib/resonanzenIndex";

interface Lens {
  key: string;
  href: string;
  title: string;
  tag: string;
  description: string;
  stat: string;
  statLabel: string;
}

export default function ErkundenPage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();
  const [corpusCount, setCorpusCount] = useState<number | null>(null);

  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => { if (idx) setCorpusCount(idx.entries.length); });
  }, []);

  const lenses: Lens[] = [
    {
      key: "begriffsnetz", href: "/begriffsnetz",
      title: "Begriffsnetz", tag: "Struktur",
      description: "Die feste Architektur des Werks — 50 Begriffe, ihre kanonischen Verbindungen, begehbar per Pfadanalyse und Cluster-Zoom.",
      stat: String(NODES.length), statLabel: "Begriffe",
    },
    {
      key: "landkarte", href: "/landkarte",
      title: "Landkarte", tag: "Wachstum",
      description: "Derselbe Graph, überlagert mit dem lebendigen Korpus — welche Begriffe die Leser:innen berühren, welche Verbindungen gerade erst entstehen.",
      stat: corpusCount != null ? String(corpusCount) : "…", statLabel: "Begegnungen im Bild",
    },
    {
      key: "philosophie", href: "/philosophie",
      title: "Philosophie", tag: "Denker",
      description: "Wer den Begriffsraum vorgedacht hat — 25 Philosoph:innen über acht Traditionen, verortet auf dem Pfad zur Resonanzvernunft.",
      stat: String(PHILOSOPHERS.length), statLabel: `Denker:innen · ${TRADITIONS.length} Traditionen`,
    },
  ];

  return (
    <div
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", background: c.void, color: c.text,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: c.muted }}>
          Resonanzvernunft
        </div>
        <h1 style={{ margin: "0.4rem 0 0.4rem", fontFamily: SERIF, fontSize: "1.9rem", color: c.textBright, lineHeight: 1.2 }}>
          Erkunden <span style={{ color: c.accentText }}>·</span> Ein Begriffsraum, drei Linsen
        </h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: c.textDim, marginTop: 0, marginBottom: "2rem", lineHeight: 1.55, maxWidth: "42rem" }}>
          Begriffsnetz, Landkarte und Philosophie zeigen denselben Raum von Begriffen —
          einmal als feste Struktur, einmal als wachsendes Feld, einmal über die Denker:innen,
          die ihn vorbereitet haben. Keine der drei ersetzt die anderen; sie sind derselbe
          Ort aus drei Richtungen betrachtet.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.1rem", marginBottom: "1rem" }}>
          {lenses.map(lens => (
            <button
              key={lens.key}
              onClick={() => navigate(lens.href)}
              style={{
                textAlign: "left", cursor: "pointer",
                background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8,
                padding: "1.3rem 1.4rem", display: "flex", flexDirection: "column", gap: "0.6rem",
                transition: "border-color 0.15s, transform 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = c.accentText; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; }}
            >
              <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: c.accentText }}>
                {lens.tag}
              </span>
              <span style={{ fontFamily: SERIF, fontSize: "1.35rem", color: c.textBright }}>{lens.title}</span>
              <span style={{ fontFamily: SERIF, fontSize: "0.85rem", color: c.textDim, lineHeight: 1.5, flex: 1 }}>
                {lens.description}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", marginTop: "0.2rem", paddingTop: "0.7rem", borderTop: `1px solid ${c.border}` }}>
                <span style={{ fontFamily: SERIF, fontSize: "1.5rem", color: c.accentText, fontVariantNumeric: "tabular-nums" }}>{lens.stat}</span>
                <span style={{ fontFamily: MONO, fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>{lens.statLabel}</span>
              </span>
            </button>
          ))}
        </div>

        <p style={{ fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.04em", color: c.muted, marginBottom: "2rem" }}>
          {EDGES.length} kanonische Kanten im Begriffsnetz · alle drei Ansichten teilen sich dieselben Begriffe.
        </p>

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
