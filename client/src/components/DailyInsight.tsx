/**
 * Erkenntnis des Tages auf der Startseite. Dieselbe Auswahl wie der Atom-Feed.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { pickDailyErkenntnis } from "@shared/dailyErkenntnis";
import SpeakButton from "@/components/SpeakButton";
import { useLocale, useT } from "@/i18n";
import { loadErkenntnisse, type Erkenntnis } from "@/lib/erkenntnisse";
import { loadKernsatzTranslations, showKernsatz } from "@/lib/kernsatzI18n";

export default function DailyInsight({ compact = false }: { compact?: boolean }) {
  const tr = useT();
  const locale = useLocale();
  const [item, setItem] = useState<Erkenntnis | null | undefined>(undefined);
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let live = true;
    Promise.all([
      loadErkenntnisse(),
      fetch(`/resonanzen-erkenntnis-withdrawn.json?_=${Date.now()}`, { cache: "no-store" })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([list, held]) => {
      if (!live) return;
      const blocked = Array.isArray(held?.answerIds) ? held.answerIds as string[] : [];
      setItem(pickDailyErkenntnis(list, new Date(), blocked));
    });
    loadKernsatzTranslations().then(map => { if (live) setTranslations(map); });
    return () => { live = false; };
  }, []);

  if (!item) return null;
  const shown = showKernsatz(item.id, item.kernsatz, locale, translations);
  const href = item.conceptAnchor
    ? `/landkarte?begriff=${encodeURIComponent(item.conceptAnchor)}`
    : "/erkenntnisse";

  return (
    <div style={{
      textAlign: "left",
      borderTop: "1px solid rgba(245,158,11,0.25)",
      paddingTop: compact ? 12 : 16,
      marginTop: compact ? 4 : 8,
    }}>
      <div style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: compact ? 9 : 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "#f59e0b",
      }}>
        {tr("daily.label")}
      </div>
      <p style={{
        fontFamily: "Georgia, serif",
        fontStyle: "italic",
        fontSize: compact ? 13 : 15,
        lineHeight: 1.45,
        color: "#e7e5e4",
        margin: "0.45rem 0 0.55rem",
      }}>
        {shown.text}
      </p>
      {shown.translated && (
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: compact ? 9 : 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a8a29e", marginBottom: 6 }}>
          {tr("daily.translation")}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
        <Link href={href} style={{ color: "#fbbf24", fontSize: compact ? 11 : 12, textDecoration: "none" }}>
          {item.conceptAnchor ? tr("daily.toConcept") : tr("daily.all")}
        </Link>
        <a href="/feed/erkenntnisse.xml" style={{ color: "#a8a29e", fontSize: compact ? 11 : 12, textDecoration: "none" }}>
          {tr("daily.feed")}
        </a>
        <SpeakButton id={`tag-${item.id}`} text={shown.text} light />
        <a href="/hoeren" style={{ color: "#a8a29e", fontSize: compact ? 11 : 12, textDecoration: "none" }}>
          {tr("daily.listen")}
        </a>
      </div>
    </div>
  );
}
