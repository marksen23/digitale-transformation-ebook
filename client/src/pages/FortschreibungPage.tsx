import { fetchCorpus } from "@/lib/corpusFetch";
/**
 * Fortschreibung (/fortschreibung). Druckbare Sammlung der veröffentlichten
 * Erkenntnisse nach Quartal und Begriff. PDF über den Druckdialog des Browsers.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES } from "@/data/conceptGraph";
import { loadErkenntnisse } from "@/lib/erkenntnisse";
import { buildErkenntnisFeed } from "@/lib/erkenntnisFeed";
import { loadResonanzenIndexLazy } from "@/lib/resonanzenIndex";
import { groupFortschreibung, type FortItem, type FortQuarter } from "@/lib/fortschreibung";
import SiteFooter from "@/components/SiteFooter";

const labels = new Map(NODES.map(node => [node.id, node.fullLabel]));

export default function FortschreibungPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [groups, setGroups] = useState<FortQuarter[] | null>(null);

  useEffect(() => {
    document.body.dataset.printable = "fortschreibung";
    return () => { delete document.body.dataset.printable; };
  }, []);

  useEffect(() => {
    Promise.all([
      loadErkenntnisse(),
      loadResonanzenIndexLazy(),
      fetchCorpus("/resonanzen-erkenntnis-withdrawn.json").then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([erk, index, held]) => {
      const feed = buildErkenntnisFeed(erk, index?.entries ?? []);
      const items: FortItem[] = feed.map(item => ({
        id: item.id,
        text: item.text,
        createdAt: item.createdAt,
        conceptId: item.conceptAnchor,
        kind: item.kind,
        answerId: item.answerId,
      }));
      setGroups(groupFortschreibung(
        items,
        Array.isArray(held?.answerIds) ? held.answerIds : [],
        Array.isArray(held?.masterIds) ? held.masterIds : [],
      ));
    });
  }, []);

  const count = groups?.reduce((sum, quarter) => sum + quarter.concepts.reduce((n, concept) => n + concept.items.length, 0), 0) ?? 0;

  return (
    <div data-scroll className="fortschreibung" style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <div className="no-print" style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>
          Erkenntnisse
        </div>
        <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>Fortschreibung</h1>
        <p className="no-print" style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, lineHeight: 1.5 }}>
          Veröffentlichte Erkenntnisse nach Quartal und Begriff. {count > 0 ? `${count} Sätze.` : ""}{" "}
          <Link href="/erkenntnisse" style={{ color: C.accentText }}>Zur Übersicht</Link>
        </p>
        <button type="button" className="no-print" onClick={() => window.print()} style={{
          fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
          color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 4,
          padding: "0.5rem 0.75rem", cursor: "pointer", minHeight: 36, marginBottom: "1.2rem",
        }}>
          Drucken oder als PDF speichern
        </button>
        {!groups ? <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p>
          : groups.length === 0 ? <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>Noch nichts Datierbares veröffentlicht.</p>
          : groups.map(quarter => (
            <section key={quarter.key} style={{ marginBottom: "1.6rem" }}>
              <h2 style={{ fontFamily: DISPLAY, fontSize: "1.35rem", color: C.textBright, borderBottom: `1px solid ${C.border}`, paddingBottom: "0.3rem" }}>{quarter.label}</h2>
              {quarter.concepts.map(concept => (
                <div key={concept.id || "ohne"} style={{ marginTop: "0.9rem" }}>
                  <h3 style={{ margin: "0 0 0.4rem", fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.accentText }}>
                    {concept.id ? (labels.get(concept.id) ?? concept.id) : "Ohne Begriff"}
                  </h3>
                  {concept.items.map(item => (
                    <p key={item.id} style={{ fontFamily: SERIF, fontSize: "1.05rem", lineHeight: 1.5, margin: "0.35rem 0 0.7rem" }}>
                      {item.text}
                      <span style={{ display: "block", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.06em", color: C.muted, marginTop: "0.2rem" }}>
                        {item.createdAt.slice(0, 10)}{item.kind === "master" ? " · Synthese" : ""}
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </section>
          ))}
        <div className="no-print"><SiteFooter c={C} /></div>
      </div>
    </div>
  );
}
