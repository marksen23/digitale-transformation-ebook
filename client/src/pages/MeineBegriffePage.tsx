/**
 * Meine Begriffe (/meine-begriffe).
 * Gemerkte Begriffe und Erkenntnisse, nur in diesem Browser.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES } from "@/data/conceptGraph";
import { loadErkenntnisse } from "@/lib/erkenntnisse";
import { loadResonanzenIndexLazy } from "@/lib/resonanzenIndex";
import { buildDensityTimeline } from "@/lib/mapTimeline";
import { buildErkenntnisFeed, type FeedItem } from "@/lib/erkenntnisFeed";
import {
  densitySince,
  insightsSince,
  readBookmarks,
  toggleBookmark,
  writeBookmarks,
  type BegriffBookmark,
} from "@/lib/begriffBookmarks";
import SiteFooter from "@/components/SiteFooter";

const labels = new Map(NODES.map(node => [node.id, node.fullLabel]));

export default function MeineBegriffePage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [marks, setMarks] = useState<BegriffBookmark[]>([]);
  const [frames, setFrames] = useState<ReturnType<typeof buildDensityTimeline>>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    setMarks(readBookmarks());
    Promise.all([loadErkenntnisse(), loadResonanzenIndexLazy()]).then(([erk, index]) => {
      const entries = index?.entries ?? [];
      setFrames(buildDensityTimeline(entries));
      setFeed(buildErkenntnisFeed(erk, entries));
    });
  }, []);

  const forget = (mark: BegriffBookmark) => {
    const next = toggleBookmark(marks, mark.kind, mark.id, mark.savedAt);
    writeBookmarks(next);
    setMarks(next);
  };

  const concepts = marks.filter(mark => mark.kind === "concept");
  const sentences = marks.filter(mark => mark.kind === "erkenntnis");
  const byId = new Map(feed.map(item => [item.id, item]));

  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>Nur dieser Browser</div>
        <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>Meine Begriffe</h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, lineHeight: 1.5 }}>
          Was sich seit dem Merken an Dichte und Erkenntnissen getan hat. Nichts davon verlässt dieses Gerät.
        </p>

        {marks.length === 0 && (
          <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>
            Noch nichts gemerkt. Der Schalter liegt auf der <Link href="/landkarte" style={{ color: C.accentText }}>Landkarte</Link> und bei den <Link href="/erkenntnisse" style={{ color: C.accentText }}>Erkenntnissen</Link>.
          </p>
        )}

        {concepts.length > 0 && <h2 style={{ fontFamily: DISPLAY, fontSize: "1.3rem", color: C.textBright }}>Begriffe</h2>}
        <div style={{ display: "grid", gap: "0.8rem" }}>
          {concepts.map(mark => {
            const density = densitySince(frames, mark.id, mark.savedAt);
            const later = insightsSince(feed, mark.id, mark.savedAt);
            return (
              <article key={mark.id} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.85rem 1rem", background: C.surface }}>
                <h3 style={{ margin: 0, fontFamily: DISPLAY, fontSize: "1.2rem" }}>
                  <Link href={`/landkarte?begriff=${encodeURIComponent(mark.id)}`} style={{ color: C.accentText, textDecoration: "none" }}>{labels.get(mark.id) ?? mark.id}</Link>
                </h3>
                <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, margin: "0.35rem 0" }}>
                  gemerkt {mark.savedAt.slice(0, 10)} · Dichte {density.atBookmark} → {density.now}
                </div>
                {later.length === 0 ? (
                  <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, margin: "0.3rem 0" }}>Seitdem keine neue Erkenntnis zu diesem Begriff.</p>
                ) : later.map(item => (
                  <p key={item.id} style={{ fontFamily: SERIF, margin: "0.35rem 0", lineHeight: 1.45 }}>{item.text}</p>
                ))}
                <button type="button" onClick={() => forget(mark)} style={quiet(C)}>Nicht mehr merken</button>
              </article>
            );
          })}
        </div>

        {sentences.length > 0 && <h2 style={{ fontFamily: DISPLAY, fontSize: "1.3rem", color: C.textBright, marginTop: "1.4rem" }}>Erkenntnisse</h2>}
        <div style={{ display: "grid", gap: "0.7rem" }}>
          {sentences.map(mark => {
            const item = byId.get(mark.id);
            return (
              <article key={mark.id} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.85rem 1rem", background: C.surface }}>
                <p style={{ fontFamily: SERIF, margin: "0 0 0.4rem", lineHeight: 1.45 }}>{item?.text ?? "Dieser Satz ist nicht mehr in der öffentlichen Sammlung."}</p>
                <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>gemerkt {mark.savedAt.slice(0, 10)}</div>
                <button type="button" onClick={() => forget(mark)} style={quiet(C)}>Nicht mehr merken</button>
              </article>
            );
          })}
        </div>
        <SiteFooter c={C} />
      </div>
    </div>
  );
}

function quiet(C: Palette): CSSProperties {
  return {
    marginTop: "0.45rem",
    fontFamily: MONO,
    fontSize: "0.55rem",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: C.muted,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  };
}
