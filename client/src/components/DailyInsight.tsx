/**
 * Erkenntnis des Tages auf der Startseite. Dieselbe Auswahl wie der Atom-Feed.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { pickDailyErkenntnis } from "@shared/dailyErkenntnis";
import { loadErkenntnisse, type Erkenntnis } from "@/lib/erkenntnisse";

export default function DailyInsight({ compact = false }: { compact?: boolean }) {
  const [item, setItem] = useState<Erkenntnis | null | undefined>(undefined);

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
    return () => { live = false; };
  }, []);

  if (!item) return null;
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
        Erkenntnis des Tages
      </div>
      <p style={{
        fontFamily: "Georgia, serif",
        fontStyle: "italic",
        fontSize: compact ? 13 : 15,
        lineHeight: 1.45,
        color: "#e7e5e4",
        margin: "0.45rem 0 0.55rem",
      }}>
        {item.kernsatz}
      </p>
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
        <Link href={href} style={{ color: "#fbbf24", fontSize: compact ? 11 : 12, textDecoration: "none" }}>
          {item.conceptAnchor ? "Zum Begriff in der Landkarte" : "Alle Erkenntnisse"}
        </Link>
        <a href="/feed/erkenntnisse.xml" style={{ color: "#a8a29e", fontSize: compact ? 11 : 12, textDecoration: "none" }}>
          Feed
        </a>
      </div>
    </div>
  );
}
