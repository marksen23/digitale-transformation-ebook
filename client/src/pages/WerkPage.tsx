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
import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { SERIF, SERIF_BODY, MONO, C_DARK, C_LIGHT, TRACKED, PAPER, type Palette } from "@/lib/theme";
import { useTheme } from "@/contexts/ThemeContext";
import SectionLabel from "@/components/SectionLabel";
import { loadResonanzenIndexLazy, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { track as trackTrajectory } from "@/lib/trajectory";

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

  // D2: Reading-Modus bekommt Pergament-warmen Hintergrund + ruhige Tinte.
  // Wird beim Mount auf <html> gesetzt und beim Unmount restauriert, damit
  // andere Pages ihren stone-Hintergrund behalten.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = isDark ? PAPER.warmDark : PAPER.warmLight;
    return () => { document.body.style.background = prev; };
  }, [isDark]);
  const [match, params] = useRoute<{ chapter?: string }>("/werk/:chapter?");
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
  }, []);

  // Map chunkId → matching Resonanzen (via passage_chunk_id im contextMeta)
  const resonanzenByChunk = useMemo(() => {
    const map = new Map<string, ResonanzEntry[]>();
    if (!resonanzen) return map;
    for (const e of resonanzen) {
      const cid = e.contextMeta?.passage_chunk_id;
      if (typeof cid === "string" && cid) {
        const arr = map.get(cid);
        if (arr) arr.push(e); else map.set(cid, [e]);
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

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem", color: isDark ? PAPER.inkDark : PAPER.inkLight, fontFamily: SERIF }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 200px", gap: "2.5rem", alignItems: "start" }}>
        {/* ── Main Reading Column — klassische Buchsatz-Breite 36rem ── */}
        <article style={{ minWidth: 0, maxWidth: "36rem", marginLeft: "auto", marginRight: "auto" }}>
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
          </header>

          {/* Lesebereich */}
          <div style={{ position: "relative" }}>
            {chapterChunks.length > 0 ? (
              chapterChunks.map(chunk => {
                const reso = resonanzenByChunk.get(chunk.id);
                const isExpanded = expandedChunk === chunk.id;
                return (
                  <ParagraphBlock
                    key={chunk.id}
                    C={C}
                    chunkId={chunk.id}
                    text={chunk.text}
                    resonanzen={reso}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedChunk(isExpanded ? null : chunk.id)}
                  />
                );
              })
            ) : (
              // Fallback ohne werk-chunks.json — Paragraphs ohne IDs, kein
              // Resonanz-Hook möglich (Selection bricht stumm ab)
              fallbackParagraphs.map((para, i) => (
                <p key={i} style={{ fontFamily: SERIF_BODY, fontSize: "1.05rem", lineHeight: 1.65, color: C.text, margin: "0 0 1rem" }}>
                  {para}
                </p>
              ))
            )}

            {chapterChunks.length === 0 && fallbackParagraphs.length === 0 && (
              <p style={{ fontStyle: "italic", color: C.muted }}>Kein Inhalt für dieses Kapitel verfügbar.</p>
            )}
          </div>

          {/* Floating Selection Action — schwebt unten links wenn Auswahl aktiv */}
          {selection && (
            <button
              onClick={() => setModalOpen(true)}
              style={{
                position: "fixed", left: "50%", bottom: "2rem", transform: "translateX(-50%)",
                zIndex: 100,
                fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase",
                color: "#080808", background: C.accent,
                border: "none", padding: "0.7rem 1.2rem",
                borderRadius: 4, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
                minHeight: 44,
              }}
            >
              ◇ Resonanz an dieser Stelle erzeugen ({selection.text.length} Zeichen)
            </button>
          )}
        </article>

        {/* ── TOC Sidebar ────────────────────────────────────────── */}
        <nav style={{ position: "sticky", top: "1rem", maxHeight: "calc(100vh - 2rem)", overflowY: "auto", paddingLeft: "1rem", borderLeft: `1px solid ${C.border}` }}>
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
  );
}

// ─── ParagraphBlock ─────────────────────────────────────────────────────

function ParagraphBlock({
  C, chunkId, text, resonanzen, isExpanded, onToggle,
}: {
  C: Palette; chunkId: string; text: string;
  resonanzen?: ResonanzEntry[]; isExpanded: boolean; onToggle: () => void;
}) {
  const count = resonanzen?.length ?? 0;
  return (
    <div style={{ position: "relative", marginBottom: "1.2rem" }}>
      <p
        data-chunk-id={chunkId}
        style={{
          fontFamily: SERIF_BODY, fontSize: "1.05rem", lineHeight: 1.65,
          color: C.text, margin: 0,
          paddingRight: count > 0 ? "2.5rem" : 0,
        }}
      >
        {text}
      </p>
      {count > 0 && (
        <button
          onClick={onToggle}
          title={`${count} Resonanz${count === 1 ? "" : "en"} an dieser Stelle`}
          style={{
            position: "absolute", top: 0, right: 0,
            fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
            color: C.accent, background: "none",
            border: `1px solid ${C.accent}`,
            padding: "0.15rem 0.4rem",
            cursor: "pointer",
            opacity: isExpanded ? 1 : 0.7,
          }}
        >
          ◇ {count}
        </button>
      )}
      {isExpanded && resonanzen && (
        <div style={{ marginTop: "0.5rem", padding: "0.6rem 0.8rem", background: `${C.accent}08`, borderLeft: `2px solid ${C.accent}` }}>
          <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent, marginBottom: "0.4rem" }}>
            Resonanzen an dieser Stelle
          </div>
          {resonanzen.map(r => (
            <div key={r.id} style={{ marginBottom: "0.5rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text, lineHeight: 1.5 }}>
              <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, marginBottom: "0.15rem" }}>
                {new Date(r.ts).toLocaleDateString("de-DE")} · {r.status}
              </div>
              {r.response.slice(0, 280)}{r.response.length > 280 ? "…" : ""}
              <a href={`/resonanzen?id=${r.id}`} style={{ marginLeft: "0.4rem", fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>↗ voller Eintrag</a>
            </div>
          ))}
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
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent, marginBottom: "0.4rem" }}>
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
            <div style={{ marginBottom: "0.8rem" }}>
              <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: "0.3rem" }}>Modus</div>
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {(["frage", "analyse", "frei"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      color: mode === m ? "#080808" : C.text,
                      background: mode === m ? C.accent : "none",
                      border: `1px solid ${C.accent}`,
                      padding: "0.4rem 0.6rem", cursor: "pointer",
                    }}
                  >
                    {m === "frage" ? "Frage stellen" : m === "analyse" ? "Analysieren" : "Freier Impuls"}
                  </button>
                ))}
              </div>
            </div>

            {mode === "frei" && (
              <div style={{ marginBottom: "0.8rem" }}>
                <label style={{ display: "block", fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: "0.3rem" }}>
                  Eigene Frage / Impuls
                </label>
                <textarea
                  value={userPrompt}
                  onChange={e => setUserPrompt(e.target.value)}
                  rows={3}
                  placeholder="Was möchtest du an dieser Stelle wissen?"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    fontFamily: SERIF, fontSize: "0.9rem", color: C.text,
                    background: C.deep, border: `1px solid ${C.border}`,
                    padding: "0.5rem", resize: "vertical",
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
            <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, marginBottom: "0.8rem", lineHeight: 1.5 }}>
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
          fontFamily: SERIF, fontStyle: "italic", fontSize: "0.75rem",
          color: C.textDim, background: "none", border: "none",
          padding: 0, cursor: "pointer",
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
            style={{ color: C.accent, textDecoration: "none" }}
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
