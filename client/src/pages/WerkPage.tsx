/**
 * WerkPage (/werk/:chapter?) — Lesemodus für den Buchtext, mit
 * Passage-Resonanz-Hook (Tier-1-3-Roadmap, Feature A).
 *
 * Rendert ebook_structured.json kapitelweise, jeder Absatz hat eine
 * stabile chunkId (aus werk-chunks.json). Bei Text-Selektion erscheint
 * ein floating Action-Button "◇ Resonanz erzeugen", der das
 * PassageResonanzModal öffnet. Klick → /api/passage-resonanz, ~10s,
 * Eintrag landet im Korpus.
 *
 * Reverse-Lookup: Passagen mit existierenden Resonanzen (via
 * resonanzen-index.json, passage_chunk_id) zeigen am rechten Rand
 * einen ◇N-Indikator. Klick auf den Indikator klappt eine Mini-Liste
 * der zugehörigen Resonanzen unter dem Absatz aus.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { SERIF, SERIF_BODY, MONO, C_DARK, C_LIGHT, PAPER, type Palette } from "@/lib/theme";
import { useTheme } from "@/contexts/ThemeContext";
import SectionLabel from "@/components/SectionLabel";
import SiteFooter from "@/components/SiteFooter";
import { loadResonanzenIndexLazy, broadcastIndexStale, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { track as trackTrajectory } from "@/lib/trajectory";
import WeiterdenkenThread from "@/components/WeiterdenkenThread";
import { extractClosingQuestion } from "@/lib/closingQuestion";
import {
  useReadingSettings, bodyFont, type ReadingSettings,
  FONT_SCALE_MIN, FONT_SCALE_MAX, MEASURE_MIN, MEASURE_MAX,
} from "@/lib/readingSettings";

interface EbookChapter {
  id: string;
  title: string;
  subtitle: string | null;
  chapter: number | null;
  part: string;
  partTitle: string;
  content: string;
}

interface EbookFile {
  meta: { title: string; subtitle: string; author: string };
  parts: Array<{ id: string; title: string; subtitle?: string }>;
  chapters: EbookChapter[];
}

interface WerkChunk {
  id: string;
  chapter: string;
  part: string;
  position: number;
  text: string;
}

interface WerkChunksFile {
  chunkCount: number;
  chunks: WerkChunk[];
}

interface CitedSelection {
  chunkId: string;
  text: string;
  chapterTitle: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Grober Satz-Splitter — genügt, um den 1-Satz-Overlap zwischen aufeinander
 *  folgenden RAG-Chunks zu erkennen (beide Chunks teilen denselben Quelltext,
 *  also liefert derselbe Splitter identische Satz-Strings). */
function splitSentencesForDisplay(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+["'»)\]]*\s*/g) ?? [text])
    .map(s => s.trim())
    .filter(Boolean);
}

/** Ent-überlappt eine geordnete Liste von Chunk-Texten für die ANZEIGE:
 *  entfernt aus jedem Chunk die führenden Sätze, die bereits am Ende des
 *  vorigen Chunks standen (Sliding-Window-Overlap aus build-werk-chunks.ts).
 *  Robust gegen Lücken (kein gemeinsamer Satz → k=0 → unverändert). */
function deoverlapTexts(texts: string[]): string[] {
  const out: string[] = [];
  let prevSentences: string[] = [];
  for (const text of texts) {
    const cur = splitSentencesForDisplay(text);
    let k = 0;
    const maxK = Math.min(prevSentences.length, cur.length);
    for (let cand = maxK; cand >= 1; cand--) {
      let match = true;
      for (let j = 0; j < cand; j++) {
        if (cur[j] !== prevSentences[prevSentences.length - cand + j]) { match = false; break; }
      }
      if (match) { k = cand; break; }
    }
    out.push(cur.slice(k).join(" "));
    prevSentences = cur;  // Overlap-Vergleich gegen den ORIGINAL-Chunk
  }
  return out;
}

/** Splittet Kapitel-Content in dieselben Chunks wie build-werk-chunks.ts
 *  produziert hat. Pragmatisches Re-Implement: Absätze trennen, die kurzen
 *  filtern. Falls werk-chunks.json verfügbar ist, machen wir Matching per
 *  Position+Text statt rekonstruktiv. */
function paragraphsForChapter(content: string): string[] {
  const normalized = content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return normalized.split(/\n\s*\n/).map(p => p.replace(/\s+/g, " ").trim()).filter(p => p.length >= 80);
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function WerkPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const isDark = theme === "dark";
  const { settings: reading, update: updateReading, reset: resetReading } = useReadingSettings();
  const readBodyFont = bodyFont(reading);

  // D2: Reading-Modus bekommt Pergament-warmen Hintergrund + ruhige Tinte.
  // Wird beim Mount auf <html> gesetzt und beim Unmount restauriert, damit
  // andere Pages ihren stone-Hintergrund behalten.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = isDark ? PAPER.warmDark : PAPER.warmLight;
    return () => { document.body.style.background = prev; };
  }, [isDark]);
  const [, params] = useRoute<{ chapter?: string }>("/werk/:chapter?");
  const [, navigate] = useLocation();

  const [ebook, setEbook] = useState<EbookFile | null>(null);
  const [chunks, setChunks] = useState<WerkChunksFile | null>(null);
  const [resonanzen, setResonanzen] = useState<ResonanzEntry[] | null>(null);
  const [selection, setSelection] = useState<CitedSelection | null>(null);
  const [expandedChunk, setExpandedChunk] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch("/ebook_structured.json").then(r => r.json()).then(setEbook).catch(() => null);
    fetch("/werk-chunks.json").then(r => r.json()).then(setChunks).catch(() => null);
    loadResonanzenIndexLazy().then(idx => idx && setResonanzen(idx.entries));
    // S1: Auto-Refresh nach Admin-Mutationen (z.B. Passage-Resonanz wurde
    // im selben Browser-Window erzeugt oder gelöscht).
    const onStale = () => {
      loadResonanzenIndexLazy().then(idx => idx && setResonanzen(idx.entries));
    };
    if (typeof window !== "undefined") {
      window.addEventListener("resonanzen-index-stale", onStale);
      return () => window.removeEventListener("resonanzen-index-stale", onStale);
    }
  }, []);

  // Map chunkId → Einträge, die an dieser Werk-Stelle andocken. Zwei Arten von
  // Anschlussstellen (Roadmap „Das wachsende Werk", Phase 2):
  //   1. Direkte Passage-Resonanzen   — contextMeta.passage_chunk_id
  //   2. RAG-Anschlussstellen         — contextMeta.werk_passages[].id
  //      (Dialog/Weiterdenken zogen diese Passage als Werk-Kontext heran →
  //      sichtbar machen, WO im Werk sich Gedanken weiterspinnen).
  const resonanzenByChunk = useMemo(() => {
    const map = new Map<string, ResonanzEntry[]>();
    if (!resonanzen) return map;
    const pushOnce = (cid: string, e: ResonanzEntry) => {
      if (!cid) return;
      const arr = map.get(cid);
      if (arr) { if (!arr.some(x => x.id === e.id)) arr.push(e); }
      else map.set(cid, [e]);
    };
    for (const e of resonanzen) {
      const cid = e.contextMeta?.passage_chunk_id;
      if (typeof cid === "string") pushOnce(cid, e);
      const wp = e.contextMeta?.werk_passages;
      if (Array.isArray(wp)) {
        for (const p of wp) {
          const pid = (p as { id?: unknown })?.id;
          if (typeof pid === "string") pushOnce(pid, e);
        }
      }
    }
    return map;
  }, [resonanzen]);

  // Aktuelles Kapitel — Default: erstes Kapitel mit Inhalt
  const currentChapter = useMemo(() => {
    if (!ebook) return null;
    const wanted = params?.chapter;
    if (wanted) {
      const ch = ebook.chapters.find(c => c.id === wanted && c.content);
      if (ch) return ch;
    }
    return ebook.chapters.find(c => c.content && c.content.length >= 200) ?? null;
  }, [ebook, params?.chapter]);

  // Chunks für aktuelles Kapitel mit ID-Lookup
  const chapterChunks = useMemo(() => {
    if (!currentChapter || !chunks) return [];
    return chunks.chunks
      .filter(c => c.chapter === currentChapter.id)
      .sort((a, b) => a.position - b.position);
  }, [currentChapter, chunks]);

  // BUGFIX (Lesequalität): werk-chunks.json nutzt ein Sliding-Window mit
  // 1-Satz-Overlap (gut für RAG-Recall). Beim VERBATIM-Rendern als Lese-Absätze
  // erschien dadurch der letzte Satz jedes Chunks am Anfang des nächsten doppelt
  // („Seiten brechen ab"). Hier ent-überlappen wir die ANZEIGE auf Satz-Ebene;
  // die chunkId pro Absatz (für den Passage-Resonanz-Hook) bleibt unverändert.
  const chapterDisplay = useMemo(
    () => deoverlapTexts(chapterChunks.map(c => c.text)),
    [chapterChunks],
  );

  // Eigener Scroll-Container — die App-weite index.css setzt overflow:hidden
  // auf html/body/#root (Reader-Vollbild-UX, kein Mobile-Overscroll). Reine
  // Flow-Seiten würden sonst geclippt + „eingefroren". Wir scrollen also IN
  // diesem Ref, nicht auf window.
  const scrollRef = useRef<HTMLDivElement>(null);

  // Standard-eBook-Verhalten: bei Kapitelwechsel an den Seitenanfang scrollen
  // (sonst bleibt man mitten im neuen Kapitel hängen — „läuft nicht rund").
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [currentChapter?.id]);

  // Fallback: rekonstruiere paragraphs lokal falls werk-chunks.json fehlt
  const fallbackParagraphs = useMemo(() => {
    if (chapterChunks.length > 0 || !currentChapter) return [];
    return paragraphsForChapter(currentChapter.content);
  }, [chapterChunks, currentChapter]);

  // Selection-Handler: nach mouseup im Lesebereich prüfen
  useEffect(() => {
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { setSelection(null); return; }
      const text = sel.toString().trim();
      if (text.length < 20) { setSelection(null); return; }
      // Finde das umschließende [data-chunk-id]-Element
      const anchorNode = sel.anchorNode;
      let el: HTMLElement | null = anchorNode?.parentElement ?? null;
      while (el && !el.dataset?.chunkId) el = el.parentElement;
      if (!el?.dataset.chunkId) { setSelection(null); return; }
      const cid = el.dataset.chunkId;
      setSelection({ chunkId: cid, text, chapterTitle: currentChapter?.title ?? "" });
      try { trackTrajectory({ type: "passage-select", chunkId: cid, text }); } catch {}
    }
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchend", onMouseUp);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", onMouseUp);
    };
  }, [currentChapter]);

  if (!ebook) {
    return <div style={{ padding: "2rem", fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>;
  }

  // Nur Kapitel mit Inhalt im Navigations-Sidebar listen
  const tocChapters = ebook.chapters.filter(c => c.content && c.content.length >= 200);

  // Lineares Blättern (Standard-eBook): vorheriges / nächstes Kapitel.
  const tocIdx = tocChapters.findIndex(c => c.id === currentChapter?.id);
  const prevCh = tocIdx > 0 ? tocChapters[tocIdx - 1] : null;
  const nextCh = tocIdx >= 0 && tocIdx < tocChapters.length - 1 ? tocChapters[tocIdx + 1] : null;

  return (
    <div
      ref={scrollRef}
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 40px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch",
        background: isDark ? PAPER.warmDark : PAPER.warmLight,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
    <div className="werk-page" style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem", color: isDark ? PAPER.inkDark : PAPER.inkLight, fontFamily: SERIF }}>
      <style>{`
        .werk-page .werk-grid { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 2.5rem; align-items: start; }
        .werk-page .werk-toc { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; padding-left: 1rem; border-left: 1px solid currentColor; opacity: 0.7; }
        @media (max-width: 768px) {
          .werk-page .werk-grid { grid-template-columns: 1fr; gap: 1.2rem; }
          .werk-page .werk-toc { position: static; max-height: 220px; padding-left: 0; border-left: none; border-top: 1px solid currentColor; padding-top: 0.7rem; opacity: 0.6; order: 2; }
        }
      `}</style>
      <div className="werk-grid">
        {/* ── Main Reading Column — klassische Buchsatz-Breite 36rem ── */}
        <article style={{ minWidth: 0, maxWidth: `${reading.measure}rem`, marginLeft: "auto", marginRight: "auto" }}>
          <header style={{ marginBottom: "1.5rem", borderBottom: `1px solid ${C.border}`, paddingBottom: "1rem" }}>
            <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: C.muted, marginBottom: "0.3rem" }}>
              {currentChapter?.partTitle ?? ebook.meta.title}
            </div>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: "1.8rem", color: C.textBright, lineHeight: 1.2 }}>
              {currentChapter?.title ?? "Werk"}
            </h1>
            {currentChapter?.subtitle && (
              <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "1rem", color: C.textDim }}>
                {currentChapter.subtitle}
              </p>
            )}
            {/* D3: Werkzeug-Dropdown statt permanent sichtbarer Links —
                ein dezenter Italic-Link „Werkzeuge ▾", aufgeklappt:
                PDF, Quer-Links, Sprache. Reading bleibt ruhig. */}
            <WerkzeugeDropdown C={C} isDark={isDark} />
            <ReadingControls C={C} settings={reading} update={updateReading} reset={resetReading} />
          </header>

          {/* Lesebereich */}
          <div style={{ position: "relative" }}>
            {chapterChunks.length > 0 ? (
              chapterChunks.map((chunk, ci) => {
                const reso = resonanzenByChunk.get(chunk.id);
                const isExpanded = expandedChunk === chunk.id;
                const displayText = chapterDisplay[ci] ?? chunk.text;
                if (!displayText.trim()) return null;  // vollständig vom Vorgänger überlappt
                return (
                  <ParagraphBlock
                    key={chunk.id}
                    C={C}
                    chunkId={chunk.id}
                    text={displayText}
                    resonanzen={reso}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedChunk(isExpanded ? null : chunk.id)}
                    fontScale={reading.fontScale}
                    bodyFont={readBodyFont}
                  />
                );
              })
            ) : (
              // Fallback ohne werk-chunks.json — Paragraphs ohne IDs, kein
              // Resonanz-Hook möglich (Selection bricht stumm ab)
              fallbackParagraphs.map((para, i) => (
                <p key={i} style={{ fontFamily: readBodyFont, fontSize: `${1.05 * reading.fontScale}rem`, lineHeight: 1.65, color: C.text, margin: "0 0 1rem" }}>
                  {para}
                </p>
              ))
            )}

            {chapterChunks.length === 0 && fallbackParagraphs.length === 0 && (
              <p style={{ fontStyle: "italic", color: C.muted }}>Kein Inhalt für dieses Kapitel verfügbar.</p>
            )}
          </div>

          {/* Lineares Blättern — vorheriges / nächstes Kapitel (Standard-eBook). */}
          {(prevCh || nextCh) && (
            <nav aria-label="Kapitel-Navigation" style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", marginTop: "2.5rem", paddingTop: "1.2rem", borderTop: `1px solid ${C.border}` }}>
              {prevCh ? (
                <button onClick={() => navigate(`/werk/${prevCh.id}`)} style={chapterNavBtn(C, "prev")}>
                  <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, display: "block" }}>← Zurück</span>
                  <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text }}>{prevCh.title}</span>
                </button>
              ) : <span />}
              {nextCh ? (
                <button onClick={() => navigate(`/werk/${nextCh.id}`)} style={chapterNavBtn(C, "next")}>
                  <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, display: "block" }}>Weiter →</span>
                  <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text }}>{nextCh.title}</span>
                </button>
              ) : <span />}
            </nav>
          )}

          {/* Floating Selection Action — schwebt unten zentriert wenn Auswahl aktiv.
              D5: bottom-Offset respektiert iOS-Selection-Toolbar (max(2rem, env(safe-area-inset-bottom))). */}
          {selection && (
            <button
              onClick={() => setModalOpen(true)}
              style={{
                position: "fixed", left: "50%",
                bottom: "max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))",
                transform: "translateX(-50%)",
                zIndex: 100,
                fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase",
                color: "#080808", background: C.accent,
                border: "none", padding: "0.75rem 1.2rem",
                borderRadius: 4, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
                minHeight: 44,
                maxWidth: "calc(100vw - 2rem)", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              ◇ Resonanz erzeugen <span style={{ opacity: 0.7 }}>({selection.text.length} Z.)</span>
            </button>
          )}
        </article>

        {/* ── TOC Sidebar ────────────────────────────────────────── */}
        <nav className="werk-toc" style={{ color: C.border }}>
          <SectionLabel c={C} color={C.muted} size="sm" tracking="tight">Inhalt</SectionLabel>
          <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {tocChapters.map(ch => {
              const active = currentChapter?.id === ch.id;
              return (
                <li key={ch.id}>
                  <button
                    onClick={() => navigate(`/werk/${ch.id}`)}
                    style={{
                      width: "100%", textAlign: "left",
                      fontFamily: SERIF, fontSize: "0.78rem", lineHeight: 1.4,
                      color: active ? C.textBright : C.textDim,
                      background: active ? `${C.accent}11` : "none",
                      border: "none",
                      borderLeft: `2px solid ${active ? C.accent : "transparent"}`,
                      padding: "0.3rem 0.5rem",
                      cursor: "pointer",
                    }}
                  >
                    {ch.title}
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Werkzeug-Links + PDF werden in D3 in einen
              „Werkzeuge ▾"-Dropdown unter dem Werk-Header verschoben. */}
        </nav>
      </div>

      <SiteFooter c={C} />

      {modalOpen && selection && currentChapter && (
        <PassageResonanzModal
          C={C}
          chunkId={selection.chunkId}
          selectedText={selection.text}
          chapterTitle={currentChapter.title}
          onClose={() => { setModalOpen(false); setSelection(null); }}
        />
      )}
    </div>
    </div>
  );
}

// ─── ParagraphBlock ─────────────────────────────────────────────────────

function chapterNavBtn(C: Palette, dir: "prev" | "next"): React.CSSProperties {
  return {
    flex: 1, maxWidth: "48%", textAlign: dir === "next" ? "right" : "left",
    background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
    padding: "0.6rem 0.85rem", cursor: "pointer", minHeight: 44,
  };
}

function ParagraphBlock({
  C, chunkId, text, resonanzen, isExpanded, onToggle, fontScale = 1, bodyFont = SERIF_BODY,
}: {
  C: Palette; chunkId: string; text: string;
  resonanzen?: ResonanzEntry[]; isExpanded: boolean; onToggle: () => void;
  fontScale?: number; bodyFont?: string;
}) {
  // Kanon-Akkretion (Phase 5): kuratierte Erkenntnisse (approved/published) sind
  // „Weiterführungen" — sie haben den Schutzwall passiert und lagern sich als
  // Kanon an die Stelle an. Rohe Einträge bleiben „Spuren" (faint).
  const all = resonanzen ?? [];
  const curated = all.filter(r => r.status === "approved" || r.status === "published");
  const others = all.filter(r => r.status !== "approved" && r.status !== "published");
  const count = all.length;
  const hasCurated = curated.length > 0;

  function renderEntry(r: ResonanzEntry, emphasized: boolean) {
    return (
      <div key={r.id} style={{ marginBottom: "0.7rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: emphasized ? C.text : C.textDim, lineHeight: 1.55, opacity: emphasized ? 1 : 0.88 }}>
        {r.response.slice(0, 280)}{r.response.length > 280 ? "…" : ""}
        <span style={{ display: "block", marginTop: "0.2rem", fontSize: "0.65rem", color: C.muted, fontStyle: "italic" }}>
          — {new Date(r.ts).toLocaleDateString("de-DE", { month: "long", day: "numeric", year: "numeric" })}
          {!emphasized && r.status !== "published" && r.status !== "approved" && (
            <span title="Status" style={{ marginLeft: "0.4rem", opacity: 0.7 }}>· {r.status}</span>
          )}
          <a
            href={`/resonanz/${r.id}`}
            style={{ marginLeft: "0.5rem", color: emphasized ? C.accent : C.muted, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px" }}
            title="Permalink-Seite mit vollem Text + Zitier-Daten öffnen"
          >
            ↗ ansehen
          </a>
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", marginBottom: "1.2rem" }}>
      <p
        data-chunk-id={chunkId}
        style={{
          fontFamily: bodyFont, fontSize: `${1.05 * fontScale}rem`, lineHeight: 1.65,
          color: C.text, margin: 0,
          paddingRight: count > 0 ? "1.8rem" : 0,
        }}
      >
        {text}
      </p>
      {/* W1: Reverse-Lookup-Indikator subtiler — kein Border-Pill mehr,
          nur ein Italic-Mini-Hinweis im Margin. Liest sich wie eine
          klassische Fußnoten-Markierung statt wie ein Filter-Button. */}
      {count > 0 && (
        <button
          onClick={onToggle}
          title={hasCurated
            ? `${curated.length} Weiterführung${curated.length === 1 ? "" : "en"}${others.length > 0 ? ` · ${others.length} Spur${others.length === 1 ? "" : "en"}` : ""} an dieser Stelle`
            : `${count} Gedanke${count === 1 ? "" : "n"} knüpfen an dieser Stelle an`}
          aria-expanded={isExpanded}
          style={{
            position: "absolute", top: "0.1rem", right: 0,
            fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem",
            color: (isExpanded || hasCurated) ? C.accent : C.muted,
            background: "none", border: "none",
            padding: "0.1rem 0.25rem",
            cursor: "pointer",
            opacity: isExpanded ? 1 : (hasCurated ? 0.9 : 0.75),
            transition: "opacity 0.15s, color 0.15s",
            lineHeight: 1,
          }}
          onMouseEnter={e => { if (!isExpanded) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = String(C.accent); } }}
          onMouseLeave={e => { if (!isExpanded) { e.currentTarget.style.opacity = hasCurated ? "0.9" : "0.75"; e.currentTarget.style.color = String(hasCurated ? C.accent : C.muted); } }}
        >
          {(isExpanded || hasCurated) ? "◆" : "◇"} {count}
        </button>
      )}
      {/* W1: Expanded-Block als Fußnoten-Italic statt Mono-Caps-Label.
          Konsistent mit D3 „QUELLEN IM WERK"-Pattern. */}
      {isExpanded && all.length > 0 && (
        <div style={{ marginTop: "0.6rem", paddingLeft: "0.9rem", borderLeft: `2px solid ${C.accent}66` }}>
          {curated.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: "0.46rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.accentText, marginBottom: "0.4rem" }}>
                ❦ Weiterführungen
              </div>
              {curated.map(r => renderEntry(r, true))}
            </>
          )}
          {others.length > 0 && (
            <>
              {curated.length > 0 && (
                <div style={{ fontFamily: MONO, fontSize: "0.46rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, margin: "0.6rem 0 0.4rem" }}>
                  weitere Spuren
                </div>
              )}
              {others.map(r => renderEntry(r, false))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Passage-Resonanz-Modal ─────────────────────────────────────────────

function PassageResonanzModal({
  C, chunkId, selectedText, chapterTitle, onClose,
}: {
  C: Palette; chunkId: string; selectedText: string; chapterTitle: string; onClose: () => void;
}) {
  const [mode, setMode] = useState<"frage" | "frei" | "analyse">("frage");
  const [userPrompt, setUserPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ entryId: string; response: string } | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/passage-resonanz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId, selectedText, mode, userPrompt: userPrompt.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult({ entryId: data.entryId, response: data.response });
        // S1: Server appendet asynchron via logResonanz → indexUpdater
        // (~1-2 sec für GitHub-PUT). Nach 2s den Stale-Pulse senden, damit
        // WerkPage die Reverse-Lookup-◇N-Indikatoren refresht (intra-tab
        // + cross-tab via BroadcastChannel).
        setTimeout(() => broadcastIndexStale(), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: 6,
          padding: "1.5rem", maxWidth: 600, width: "100%",
          maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.accentText, marginBottom: "0.4rem" }}>
          ◇ Passage-Resonanz · {chapterTitle}
        </div>

        <blockquote style={{
          margin: "0 0 1rem", padding: "0.6rem 0.9rem",
          background: `${C.accent}08`, borderLeft: `3px solid ${C.accent}`,
          fontFamily: SERIF, fontStyle: "italic", fontSize: "0.9rem", color: C.text, lineHeight: 1.55,
        }}>
          "{selectedText.length > 400 ? selectedText.slice(0, 400) + "…" : selectedText}"
        </blockquote>

        {!result && (
          <>
            {/* W2: Modus-Auswahl literarisch eingebunden — Italic-Serif-
                Frage-Prompt statt Mono-Caps-„Modus"-Label. Pills sind
                schmaler und nutzen die accent-Variante nur beim aktiven
                Zustand. */}
            <div style={{ marginBottom: "0.9rem" }}>
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, marginBottom: "0.4rem" }}>
                Wie soll die KI auf diese Stelle antworten?
              </div>
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {([
                  { key: "frage" as const,    label: "Eine Frage formulieren" },
                  { key: "analyse" as const,  label: "Analysieren" },
                  { key: "frei" as const,     label: "Eigener Impuls" },
                ]).map(opt => {
                  const active = mode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setMode(opt.key)}
                      style={{
                        fontFamily: MONO, fontSize: "0.52rem", letterSpacing: "0.08em", textTransform: "uppercase",
                        color: active ? "#080808" : C.muted,
                        background: active ? C.accent : "none",
                        border: `1px solid ${active ? C.accent : C.border}`,
                        padding: "0.35rem 0.6rem", cursor: "pointer",
                        borderRadius: 3, minHeight: 30,
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "frei" && (
              <div style={{ marginBottom: "0.9rem" }}>
                <label style={{ display: "block", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, marginBottom: "0.4rem" }}>
                  Welcher Impuls treibt dich an dieser Stelle?
                </label>
                <textarea
                  value={userPrompt}
                  onChange={e => setUserPrompt(e.target.value)}
                  rows={3}
                  placeholder="Was möchtest du an dieser Stelle wissen?"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    fontFamily: SERIF, fontStyle: "italic", fontSize: "0.92rem", color: C.text,
                    background: C.deep, border: `1px solid ${C.border}`, borderRadius: 3,
                    padding: "0.6rem 0.7rem", resize: "vertical", lineHeight: 1.5,
                    outline: "none",
                  }}
                />
              </div>
            )}

            {error && (
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: "#c48282", marginBottom: "0.6rem" }}>
                ✕ {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                onClick={onClose}
                style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.5rem 0.8rem", cursor: "pointer", minHeight: 36 }}
              >Abbrechen</button>
              <button
                onClick={() => void submit()}
                disabled={loading || (mode === "frei" && userPrompt.trim().length < 5)}
                style={{
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "#080808", background: C.accent,
                  border: "none", padding: "0.5rem 0.9rem",
                  cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
                  minHeight: 36,
                }}
              >
                {loading ? "Generiert …" : "◇ Resonanz erzeugen"}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#7ab898", marginBottom: "0.5rem" }}>
              ✓ Resonanz erzeugt · ID {result.entryId}
            </div>
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.95rem", color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: "1rem" }}>
              {result.response}
            </div>
            {/* Weiterdenken: die Schlussfrage der Passage-Resonanz weitertragen. */}
            {(() => {
              const q = extractClosingQuestion(result.response);
              if (!q) return null;
              return (
                <WeiterdenkenThread
                  key={result.entryId}
                  c={C}
                  initialQuestion={q}
                  focus={`passage:${chunkId.slice(0, 8)}`}
                />
              );
            })()}
            <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, margin: "0.8rem 0", lineHeight: 1.5 }}>
              Eintrag ist auf GitHub gepushed. Erscheint nach dem nächsten CI-Build (~2-3 Min) auf /resonanzen und in der Sidebar-Liste an dieser Stelle.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ fontFamily: MONO, fontSize: "0.55rem", color: "#080808", background: C.accent, border: "none", padding: "0.5rem 0.9rem", cursor: "pointer", minHeight: 36 }}>
                Schließen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ReadingControls (Phase 6) — Lese-Komfort-Regler ──────────────────────
// Dezente Disclosure „Aa Lesen ▾": Schriftgröße, Zeilenbreite, Serif/Sans.
// Persistenz via useReadingSettings (localStorage). Kein Server.
function ReadingControls({
  C, settings, update, reset,
}: {
  C: Palette;
  settings: ReadingSettings;
  update: (patch: Partial<ReadingSettings>) => void;
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const STEP_F = 0.05, STEP_M = 2;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem",
          color: C.textDim, background: "none", border: "none", padding: "0.4rem 0.3rem", marginLeft: "-0.3rem", cursor: "pointer",
          textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px",
        }}
      >
        Aa Lesen {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={{
          marginTop: "0.5rem", padding: "0.7rem 0.9rem",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
          display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 320,
        }}>
          <Stepper C={C} label="Schriftgröße" value={`${Math.round(settings.fontScale * 100)}%`}
            onMinus={() => update({ fontScale: round2(Math.max(FONT_SCALE_MIN, settings.fontScale - STEP_F)) })}
            onPlus={() => update({ fontScale: round2(Math.min(FONT_SCALE_MAX, settings.fontScale + STEP_F)) })} />
          <Stepper C={C} label="Zeilenbreite" value={`${settings.measure} rem`}
            onMinus={() => update({ measure: Math.max(MEASURE_MIN, settings.measure - STEP_M) })}
            onPlus={() => update({ measure: Math.min(MEASURE_MAX, settings.measure + STEP_M) })} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem" }}>
            <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Schriftart</span>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              {([["serif", true], ["sans", false]] as Array<[string, boolean]>).map(([label, val]) => {
                const active = settings.serifBody === val;
                return (
                  <button key={label} onClick={() => update({ serifBody: val })} style={{
                    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase",
                    color: active ? "#080808" : C.muted, background: active ? C.accent : "none",
                    border: `1px solid ${active ? C.accent : C.border}`, borderRadius: 3,
                    padding: "0.3rem 0.5rem", cursor: "pointer", minHeight: 30,
                  }}>{label}</button>
                );
              })}
            </div>
          </div>
          <button onClick={reset} style={{
            alignSelf: "flex-start", fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.06em", textTransform: "uppercase",
            color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline",
          }}>zurücksetzen</button>
        </div>
      )}
    </div>
  );
}

function Stepper({ C, label, value, onMinus, onPlus }: {
  C: Palette; label: string; value: string; onMinus: () => void; onPlus: () => void;
}) {
  const btn: React.CSSProperties = {
    fontFamily: MONO, fontSize: "0.85rem", lineHeight: 1, color: C.text,
    background: "none", border: `1px solid ${C.border}`, borderRadius: 3,
    width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem" }}>
      <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <button onClick={onMinus} style={btn} aria-label={`${label} verkleinern`}>−</button>
        <span style={{ fontFamily: MONO, fontSize: "0.65rem", color: C.textDim, minWidth: 48, textAlign: "center" }}>{value}</span>
        <button onClick={onPlus} style={btn} aria-label={`${label} vergrößern`}>+</button>
      </div>
    </div>
  );
}

// ─── WerkzeugeDropdown (Sprint D3) ────────────────────────────────────────
// Subtle Disclosure unter dem Werk-Header. Geschlossen: dezenter Italic-Link
// „Werkzeuge ▾". Aufgeklappt: PDF-Download + Quer-Links zu Werkzeug-Seiten.
// Ersetzt die zuvor permanent sichtbaren Sidebar-Links + PDF-Download.
function WerkzeugeDropdown({ C, isDark: _isDark }: { C: Palette; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: "0.6rem" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem",
          color: C.textDim, background: "none", border: "none",
          padding: "0.4rem 0.3rem", marginLeft: "-0.3rem", cursor: "pointer",
          textDecoration: "underline", textDecorationStyle: "dotted",
          textUnderlineOffset: "3px",
        }}
      >
        Werkzeuge {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={{
          marginTop: "0.5rem", padding: "0.7rem 0.9rem",
          background: C.surface, border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", gap: "0.35rem",
          fontFamily: SERIF, fontSize: "0.85rem",
        }}>
          <a
            href="/exports/resonanzvernunft.pdf"
            download="resonanzvernunft.pdf"
            style={{ color: C.accentText, textDecoration: "none" }}
          >
            ↓ Werk als PDF herunterladen
          </a>
          <Link to="/begriffsnetz" style={{ color: C.textDim, textDecoration: "none" }}>↪ Begriffsnetz öffnen</Link>
          <Link to="/resonanzen" style={{ color: C.textDim, textDecoration: "none" }}>↪ Resonanzen-Korpus</Link>
          <Link to="/mein-werk" style={{ color: C.textDim, textDecoration: "none" }}>↪ Mein Werk (Lese-Trajektorie)</Link>
        </div>
      )}
    </div>
  );
}
