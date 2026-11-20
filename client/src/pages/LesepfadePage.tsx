/**
 * Geführte Lesepfade (/lesepfade und /lesepfade/:slug).
 * Kuratierte Wege durch die Landkarte; Leser-Resonanzen aus dem öffentlichen Korpus.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES } from "@/data/conceptGraph";
import { READING_PATHS, readingPathBySlug } from "@/data/readingPaths";
import { loadResonanzenIndexLazy, type ResonanzEntry } from "@/lib/resonanzenIndex";
import SiteFooter from "@/components/SiteFooter";

const CURATED = new Set(["approved", "published"]);
const nodeLabel = new Map(NODES.map(n => [n.id, n.fullLabel]));

function snippetsFor(entries: ResonanzEntry[], conceptId: string): ResonanzEntry[] {
  return entries
    .filter(e => CURATED.has(e.status) && (e.nodeIds ?? []).includes(conceptId) && (e.response ?? "").trim())
    .slice(0, 2);
}

function PathList({ C }: { C: Palette }) {
  return (
    <>
      <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>
        Landkarte
      </div>
      <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>Geführte Lesepfade</h1>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, lineHeight: 1.5, maxWidth: "40rem" }}>
        Drei Wege durch das Begriffsnetz. Jede Station trägt eine Frage und, wo der Korpus sie hat, Stimmen aus bereits veröffentlichten Resonanzen.
      </p>
      <div style={{ display: "grid", gap: "0.8rem", marginTop: "1.2rem" }}>
        {READING_PATHS.map(p => (
          <Link key={p.slug} href={`/lesepfade/${p.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.9rem 1rem", background: C.surface }}>
              <h2 style={{ margin: 0, fontFamily: DISPLAY, fontSize: "1.25rem", color: C.textBright }}>{p.title}</h2>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, margin: "0.35rem 0 0" }}>{p.summary}</p>
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accentText, marginTop: "0.5rem" }}>
                {p.stations.length} Stationen
              </div>
            </article>
          </Link>
        ))}
      </div>
    </>
  );
}

function PathDetail({ C, slug }: { C: Palette; slug: string }) {
  const path = readingPathBySlug(slug);
  const [entries, setEntries] = useState<ResonanzEntry[]>([]);
  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => setEntries(idx?.entries ?? []));
  }, []);
  const stations = useMemo(() => path?.stations ?? [], [path]);
  if (!path) {
    return <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>Diesen Pfad gibt es nicht. <Link href="/lesepfade">Zur Übersicht</Link></p>;
  }
  return (
    <>
      <Link href="/lesepfade" style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accentText, textDecoration: "none" }}>Alle Pfade</Link>
      <h1 style={{ margin: "0.5rem 0 0.3rem", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>{path.title}</h1>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>{path.summary}</p>
      <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "1rem", marginTop: "1.2rem" }}>
        {stations.map((s, i) => {
          const label = nodeLabel.get(s.conceptId) ?? s.conceptId;
          const voices = snippetsFor(entries, s.conceptId);
          return (
            <li key={s.conceptId} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.9rem 1rem", background: C.surface }}>
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
                Station {i + 1}
              </div>
              <h2 style={{ margin: "0.25rem 0", fontFamily: DISPLAY, fontSize: "1.2rem" }}>
                <Link href={`/landkarte?begriff=${encodeURIComponent(s.conceptId)}`} style={{ color: C.accentText, textDecoration: "none" }}>{label}</Link>
              </h2>
              <p style={{ fontFamily: SERIF, lineHeight: 1.55, color: C.text }}>{s.passage}</p>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>„{s.question}“</p>
              {voices.length > 0 && (
                <div style={{ marginTop: "0.6rem" }}>
                  <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>aus dem Korpus</div>
                  {voices.map(v => {
                    const clip = (v.response ?? "").replace(/\s+/g, " ").trim();
                    const short = clip.length > 220 ? `${clip.slice(0, 220)}…` : clip;
                    return (
                      <p key={v.id} style={{ fontFamily: SERIF, fontSize: "0.9rem", color: C.textDim, lineHeight: 1.5 }}>
                        {short}{" "}
                        <Link href={`/resonanz/${encodeURIComponent(v.id)}`} style={{ color: C.accentText, fontFamily: MONO, fontSize: "0.55rem" }}>lesen</Link>
                      </p>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export default function LesepfadePage() {
  const { theme } = useTheme();
  const C = theme === "dark" ? C_DARK : C_LIGHT;
  const [, params] = useRoute("/lesepfade/:slug");
  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.4rem 0" }}>
        {params?.slug ? <PathDetail C={C} slug={params.slug} /> : <PathList C={C} />}
        <SiteFooter c={C} />
      </div>
    </div>
  );
}
