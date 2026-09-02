/**
 * MobileIndexOverlay — vollflächiges, typografisches Inhaltsverzeichnis für
 * den mobilen Reader-first-Kern. Ersetzt AppFrame's Dropdown-Drawer in den
 * Lese-Bildschirmen (Cover, Leser): die zwölf Bereiche als Satzordnung des
 * Buches, mit Seitenzahlen/Kennzahlen rechtsbündig — kein Tab-Bar.
 *
 * Reine Präsentationsschicht über echten Routen (wouter `navigate`); lädt
 * selbst nur die paar Zähler, die im Verzeichnis stehen (Begegnungen,
 * offene Fragen, Erkenntnisse), gecacht über die bestehenden Loader.
 */
import { useEffect, useState } from "react";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import type { EbookChapter } from "@/lib/werkChunks";
import { loadResonanzenIndexLazy } from "@/lib/resonanzenIndex";
import { loadQuestions } from "@/lib/questions";
import { loadErkenntnisse } from "@/lib/erkenntnisse";

interface Props {
  C: Palette;
  tocChapters: EbookChapter[];
  navigate: (to: string) => void;
  onClose: () => void;
  onSearch: () => void;
}

interface Band { title: string; subtitle: string; href: string; page: number }

export default function MobileIndexOverlay({ C, tocChapters, navigate, onClose, onSearch }: Props) {
  const [counts, setCounts] = useState<{ begegnungen: number | null; fragen: number | null; erk: number | null }>({
    begegnungen: null, fragen: null, erk: null,
  });

  useEffect(() => {
    let live = true;
    loadResonanzenIndexLazy().then(idx => { if (live && idx) setCounts(c => ({ ...c, begegnungen: idx.count })); });
    loadQuestions().then(q => { if (live && q) setCounts(c => ({ ...c, fragen: q.stats.open })); });
    loadErkenntnisse().then(e => { if (live) setCounts(c => ({ ...c, erk: e.length })); });
    return () => { live = false; };
  }, []);

  // Bände aus den echten Kapiteln ableiten (partTitle gruppiert), erste
  // Zeile je Band = Sprungziel + laufende Kapitelnummer als Seitenzahl.
  const bands: Band[] = [];
  const seenParts = new Set<string>();
  tocChapters.forEach((ch, i) => {
    if (seenParts.has(ch.part)) return;
    seenParts.add(ch.part);
    bands.push({ title: ch.partTitle, subtitle: ch.title, href: `/werk/${ch.id}`, page: i + 1 });
  });

  // Vier Absichts-Cluster statt einer flachen "Werkzeuge"-Liste (Redesign
  // Phase 1) — dieselbe Gruppierung wie AppFrames Desktop-Dropdown. Betrieb
  // (Kuration/Metrics/Health) taucht bewusst nicht mehr auf; wer den Token
  // hat, geht über /admin?token=…, wie schon bisher. Status bleibt als
  // öffentliche Ecke unter Mitdenken erreichbar.
  const clusters: Array<{ label: string; items: Array<{ label: string; sub: string; href: string }> }> = [
    {
      label: "Lesen",
      items: [
        { label: "Projekt", sub: "BESCHREIBUNG", href: "/projekt" },
      ],
    },
    {
      label: "Erkunden",
      items: [
        { label: "Begriffsnetz", sub: "KARTE", href: "/begriffsnetz" },
        { label: "Landkarte", sub: "WISSEN", href: "/landkarte" },
        { label: "Philosophie", sub: "VERORTUNG", href: "/philosophie" },
      ],
    },
    {
      label: "Mitdenken",
      items: [
        { label: "Fragen", sub: counts.fragen != null ? `${counts.fragen} OFFEN` : "OFFEN", href: "/fragen" },
        { label: "Erkenntnisse", sub: counts.erk != null ? String(counts.erk) : "", href: "/erkenntnisse" },
        { label: "Wissen", sub: counts.begegnungen != null ? `${counts.begegnungen} BEGEGNUNGEN` : "BEGEGNUNGEN", href: "/resonanzen" },
        { label: "Live", sub: "STROM", href: "/live" },
        { label: "Statistik", sub: "ZAHLEN", href: "/statistik" },
        { label: "Status", sub: "ÖFFENTLICH", href: "/status" },
      ],
    },
    {
      label: "Meins",
      items: [
        { label: "Mein Werk", sub: "TRAJEKTORIE", href: "/mein-werk" },
        { label: "Blog", sub: "", href: "/blog" },
      ],
    },
  ];

  const go = (href: string) => { onClose(); navigate(href); };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: C.void, overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{
        padding: "18px 22px 10px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: C.void, zIndex: 2,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.accentText }}>
          ❦&nbsp;&nbsp;Inhalt
        </div>
        <button
          type="button" onClick={onClose} aria-label="Schließen"
          style={{ minHeight: 44, minWidth: 44, background: "none", border: "none", color: C.textDim, fontFamily: MONO, fontSize: 16, cursor: "pointer" }}
        >×</button>
      </div>

      {/* Auf Desktop-Breite (WerkPage teilt sich diese Übersicht mit Mobile,
          Redesign Phase 2) bleibt der Inhalt buchsatzbreit statt über den
          ganzen Bildschirm zu strecken — auf schmalen Viewports ist 640px
          ohnehin größer als die verfügbare Breite, wirkt sich dort also nicht aus. */}
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ padding: "0 22px" }}>
        <button
          type="button" onClick={() => { onClose(); onSearch(); }}
          style={{
            width: "100%", minHeight: 46, display: "flex", alignItems: "center", gap: 10,
            padding: "0 12px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
            color: C.muted, fontFamily: SERIF, fontStyle: "italic", fontSize: 14, cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ fontFamily: MONO, fontStyle: "normal", color: C.accentText }}>⌕</span>
          <span>Begriff, Kapitel, Resonanz …</span>
        </button>
      </div>

      <div style={{ padding: "26px 22px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
          <span>Das Werk</span><span style={{ color: C.accent }}>{tocChapters.length}</span>
        </div>
        <div style={{ height: 1, background: C.border, marginBottom: 2 }} />
        {bands.map(b => (
          <button
            key={b.href} type="button" onClick={() => go(b.href)}
            style={{
              width: "100%", minHeight: 56, display: "flex", alignItems: "baseline", justifyContent: "space-between",
              gap: 12, background: "none", border: "none", borderBottom: `1px solid ${C.border}`,
              padding: "12px 0", cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, color: C.textBright }}>{b.title}</span>
              {b.subtitle !== b.title && (
                <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, color: C.textDim }}>{b.subtitle}</span>
              )}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.accentText, fontVariantNumeric: "tabular-nums" }}>{b.page}</span>
          </button>
        ))}
      </div>

      {clusters.map((cluster, ci) => (
        <div key={cluster.label} style={{ padding: ci === clusters.length - 1 ? "26px 22px 30px" : "26px 22px 0" }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{cluster.label}</div>
          <div style={{ height: 1, background: C.border }} />
          {cluster.items.map(t => (
            <button
              key={t.href} type="button" onClick={() => go(t.href)}
              style={{
                width: "100%", minHeight: 48, display: "flex", alignItems: "baseline", justifyContent: "space-between",
                background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: 0, cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 19, color: C.text }}>{t.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", color: C.muted }}>{t.sub}</span>
            </button>
          ))}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 30px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.45em", color: C.muted }}>⁂</div>
      </div>
    </div>
  );
}
