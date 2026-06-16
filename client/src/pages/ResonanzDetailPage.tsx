/**
 * ResonanzDetailPage (/resonanz/:id) — Tier-1-3-Roadmap, Feature H.
 *
 * Permalink-Seite für eine einzelne Resonanz — zitierfähig.
 * Enthält:
 *   - Vollständiger Antworttext mit Frontmatter-Metadata
 *   - BibTeX-Box (kopierbar)
 *   - JSON-LD-Schema-Tag im Head (via React effect)
 *   - Open-Graph-Tags (statisch via injected meta)
 *   - Link zurück zum Werk-Anker (falls passage_chunk_id existiert)
 */
import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { SERIF, MONO, C_DARK, C_LIGHT, type Palette } from "@/lib/theme";
import { loadResonanzenIndex, type ResonanzEntry, ENDPOINT_LABEL, ENDPOINT_COLOR } from "@/lib/resonanzenIndex";
import { toBibtex, toJsonLd } from "@/lib/bibtex";
import SiteFooter from "@/components/SiteFooter";

export default function ResonanzDetailPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ id: string }>("/resonanz/:id");
  const [entry, setEntry] = useState<ResonanzEntry | null>(null);
  const [allEntries, setAllEntries] = useState<ResonanzEntry[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [bibtexCopied, setBibtexCopied] = useState(false);

  useEffect(() => {
    loadResonanzenIndex().then(idx => {
      setAllEntries(idx.entries);
      const e = idx.entries.find(x => x.id === params?.id);
      if (e) { setEntry(e); setNotFound(false); } else setNotFound(true);
    }).catch(() => setNotFound(true));
  }, [params?.id]);

  // Verwandte + Echo-Einträge auflösen (für die Weiterführungs-Navigation).
  const byId = useMemo(() => new Map(allEntries.map(e => [e.id, e])), [allEntries]);
  const related = useMemo(
    () => (entry?.related ?? []).map(id => byId.get(id)).filter((e): e is ResonanzEntry => !!e),
    [entry, byId],
  );
  const echoes = useMemo(
    () => (entry?.nearDuplicates ?? []).map(id => byId.get(id)).filter((e): e is ResonanzEntry => !!e),
    [entry, byId],
  );

  // JSON-LD injection für SEO / Google Scholar
  useEffect(() => {
    if (!entry) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(toJsonLd(entry));
    document.head.appendChild(script);
    // Title-Tag setzen
    const prevTitle = document.title;
    document.title = `${entry.id} — Resonanzvernunft`;
    // OG-Tags
    const ogTags: HTMLMetaElement[] = [];
    const ogPairs: Array<[string, string]> = [
      ["og:title", `${entry.id} — Resonanzvernunft`],
      ["og:description", entry.response.slice(0, 200)],
      ["og:type", "article"],
      ["og:url", `https://digitale-transformation-ebook.netlify.app/resonanz/${entry.id}`],
    ];
    for (const [prop, content] of ogPairs) {
      const m = document.createElement("meta");
      m.setAttribute("property", prop);
      m.setAttribute("content", content);
      document.head.appendChild(m);
      ogTags.push(m);
    }
    return () => {
      script.remove();
      ogTags.forEach(t => t.remove());
      document.title = prevTitle;
    };
  }, [entry]);

  const bib = useMemo(() => entry ? toBibtex(entry) : "", [entry]);

  function copyBibtex() {
    if (!bib) return;
    navigator.clipboard.writeText(bib).then(() => {
      setBibtexCopied(true);
      setTimeout(() => setBibtexCopied(false), 2000);
    });
  }

  if (notFound) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem", fontFamily: SERIF, color: C.text }}>
        <h1>Eintrag nicht gefunden</h1>
        <p>Diese Resonanz existiert (noch) nicht im Index. <Link to="/resonanzen" style={{ color: C.accentText }}>← zurück zur Übersicht</Link></p>
      </div>
    );
  }
  if (!entry) {
    return <div style={{ padding: "2rem", fontStyle: "italic" }}>lädt …</div>;
  }

  const chunkId = typeof entry.contextMeta?.passage_chunk_id === "string" ? entry.contextMeta.passage_chunk_id : null;
  const chapter = typeof entry.contextMeta?.chapter === "string" ? entry.contextMeta.chapter : null;

  return (
    <div
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", background: C.void, color: C.text,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
    <article style={{ maxWidth: 800, margin: "0 auto", padding: "1.5rem 1.5rem 0", color: C.text, fontFamily: SERIF }}>
      {/* Top-Navigation — sofort sichtbar, ohne Scrollen */}
      <div style={{ marginBottom: "1rem" }}>
        <button
          onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/resonanzen"))}
          style={{
            fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase",
            color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "0.5rem 0.75rem", minHeight: 40, cursor: "pointer",
          }}
        >← zurück</button>
      </div>
      <header style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.15em", textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint], marginBottom: "0.3rem" }}>
          {ENDPOINT_LABEL[entry.endpoint]} · {entry.id}
        </div>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: "1.6rem", color: C.textBright, lineHeight: 1.3 }}>
          {entry.prompt.slice(0, 140)}{entry.prompt.length > 140 ? "…" : ""}
        </h1>
        <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.7rem", fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>
          <span>📅 {new Date(entry.ts).toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" })}</span>
          <span>· status: {entry.status}</span>
          {entry.nodeIds.length > 0 && <span>· {entry.nodeIds.length} Knoten</span>}
          {typeof entry.werkVoiceScore === "number" && <span>· werkVoice {entry.werkVoiceScore.toFixed(2)}</span>}
        </div>
      </header>

      {chunkId && (
        <div style={{ marginBottom: "1rem", padding: "0.6rem 0.8rem", background: `${C.accent}08`, borderLeft: `3px solid ${C.accent}`, fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text }}>
          Verankert in einer Werkpassage —
          {chapter ? <Link to={`/werk/${chapter}`} style={{ marginLeft: "0.3rem", color: C.accentText, textDecoration: "underline" }}>↩ zur Passage im Werk</Link> : null}
        </div>
      )}

      <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, marginBottom: "0.7rem", fontSize: "0.9rem" }}>
        <strong>Frage:</strong> {entry.prompt}
      </div>

      <div style={{ marginBottom: "2rem" }}>
        {entry.response.split(/\n\n+/).map((para, i) => (
          <p key={i} style={{ fontFamily: SERIF, fontSize: "1rem", lineHeight: 1.65, color: C.text, margin: "0 0 0.8rem" }}>
            {para.trim()}
          </p>
        ))}
      </div>

      {/* BibTeX — D3: Disclosure-Pattern. Geschlossen by default,
          Akademiker klappen auf wenn nötig. Statt großem Code-Block
          ein dezenter Italic-Link „Zitieren ▾". */}
      <BibtexDisclosure C={C} bib={bib} onCopy={copyBibtex} copied={bibtexCopied} />

      {/* Weiterführungen — verwandte Begegnungen + Echos, jeweils als
          zuverlässiger Permalink-Link (der Faden läuft hier weiter). */}
      {(related.length > 0 || echoes.length > 0) && (
        <section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: `1px solid ${C.border}` }}>
          {related.length > 0 && (
            <div style={{ marginBottom: echoes.length > 0 ? "1.2rem" : 0 }}>
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem" }}>Verwandte Begegnungen</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {related.map(r => <RelatedLink key={r.id} C={C} entry={r} />)}
              </div>
            </div>
          )}
          {echoes.length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.accentText, marginBottom: "0.5rem" }}>◉ Echos — nahezu identische Begegnungen</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {echoes.map(r => <RelatedLink key={r.id} C={C} entry={r} />)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Permalink */}
      <section style={{ marginTop: "1.5rem", fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>
        <div>Permalink: <code>{`https://digitale-transformation-ebook.netlify.app/resonanz/${entry.id}`}</code></div>
      </section>

      <nav style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: `1px solid ${C.border}`, display: "flex", gap: "1rem", fontFamily: MONO, fontSize: "0.6rem" }}>
        <Link to="/resonanzen" style={{ color: C.muted, textDecoration: "none" }}>← alle Resonanzen</Link>
        <Link to="/werk" style={{ color: C.muted, textDecoration: "none" }}>↪ Werk lesen</Link>
        <Link to="/begriffsnetz" style={{ color: C.muted, textDecoration: "none" }}>↪ Begriffsnetz</Link>
      </nav>

      <SiteFooter c={C} />
    </article>
    </div>
  );
}

// ─── RelatedLink — zuverlässiger Permalink-Link zu einer weiterführenden Begegnung
function RelatedLink({ C, entry }: { C: Palette; entry: ResonanzEntry }) {
  return (
    <Link
      to={`/resonanz/${entry.id}`}
      style={{
        display: "flex", gap: "0.5rem", alignItems: "baseline",
        fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem",
        color: C.text, textDecoration: "none",
        border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.45rem 0.6rem",
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", color: ENDPOINT_COLOR[entry.endpoint], flexShrink: 0 }}>
        {ENDPOINT_LABEL[entry.endpoint].slice(0, 5)}
      </span>
      <span style={{ flex: 1 }}>
        {entry.prompt.length > 100 ? entry.prompt.slice(0, 100) + "…" : entry.prompt}
      </span>
      <span style={{ color: C.accentText, flexShrink: 0 }}>→</span>
    </Link>
  );
}

// ─── BibtexDisclosure (Sprint D3) ────────────────────────────────────────
// Disclosure-Pattern für BibTeX. Geschlossen zeigt nur einen Italic-Link
// „Zitieren ▾". Aufgeklappt: der monospace-Block + Copy-Button.
function BibtexDisclosure({ C, bib, onCopy, copied }: {
  C: Palette; bib: string; onCopy: () => void; copied: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem",
          color: C.textDim, background: "none", border: "none",
          padding: 0, cursor: "pointer",
          textDecoration: "underline", textDecorationStyle: "dotted",
          textUnderlineOffset: "3px",
        }}
      >
        Zitieren {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={{ marginTop: "0.7rem" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.4rem" }}>
            <button
              onClick={onCopy}
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: copied ? "#7ab898" : C.muted,
                background: "none",
                border: `1px solid ${copied ? "#7ab898" : C.border}`,
                padding: "0.3rem 0.6rem", cursor: "pointer", minHeight: 30,
              }}
            >
              {copied ? "✓ kopiert" : "BibTeX kopieren"}
            </button>
          </div>
          <pre style={{
            fontFamily: MONO, fontSize: "0.6rem", color: C.text,
            background: C.deep, border: `1px solid ${C.border}`,
            padding: "0.7rem 0.9rem", overflow: "auto", lineHeight: 1.5, margin: 0,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>{bib}</pre>
        </div>
      )}
    </section>
  );
}
