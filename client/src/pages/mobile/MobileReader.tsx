/**
 * MobileReader — Reader-first-Kern für Telefone (Design: "Mobile app design
 * scope", Runde 1). Kein Kopfbereich: Tippen/Wischen blättert (Seitenlauf
 * „paged"), oder durchlaufender Text („scroll") — beides echte
 * ReadingSettings.pageMode. Schmale, immer sichtbare Fußzeile mit
 * Seite/Fortschritt, Mini-Hörleiste, Suche, Aa-Einstellungen und ≡ Inhalt.
 *
 * Die ◇N/◆N-Randnotiz, Textauswahl → "◇ Resonanz erzeugen" und das Modal
 * sind exakt die Desktop-Bausteine aus WerkPage — hier nur neu gerahmt,
 * nicht neu erfunden.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MONO, PAPER, SERIF, type Palette } from "@/lib/theme";
import {
  bodyFont, FONT_SCALE_MIN, FONT_SCALE_MAX, MEASURE_MIN, MEASURE_MAX,
  type ReadingSettings,
} from "@/lib/readingSettings";
import type { EbookChapter, EbookFile, WerkChunk } from "@/lib/werkChunks";
import type { ResonanzEntry } from "@/lib/resonanzenIndex";
import type { AudioPlayerAPI } from "@/hooks/useAudioPlayer";
import { toggleGlobalTheme } from "@/lib/globalTheme";
import { markChapterComplete } from "@/lib/readingProgress";
import { parseGlossaryEntries, groupGlossaryByLetter } from "@/lib/glossary";
import { ParagraphBlock, PassageResonanzModal } from "@/pages/WerkPage";
import MobileIndexOverlay from "@/pages/mobile/MobileIndexOverlay";
import MobileSearchOverlay from "@/pages/mobile/MobileSearchOverlay";

// Enkidu (Frage-KI): derselbe Vollbild-Chat wie im Desktop-Reader, hier per
// eigenem Chunk nachgeladen — kein Grund, ihn ins Kern-Reader-Bundle zu ziehen.
const EnkiduPage = lazy(() => import("@/pages/EnkiduPage"));

interface CitedSelection { chunkId: string; text: string; chapterTitle: string }

interface Props {
  C: Palette; isDark: boolean;
  ebook: EbookFile; tocChapters: EbookChapter[];
  currentChapter: EbookChapter | null; prevCh: EbookChapter | null; nextCh: EbookChapter | null;
  chapterChunks: WerkChunk[]; chapterDisplay: string[];
  chunkCount: number; globalChunkIndex: (id: string) => number;
  resonanzenByChunk: Map<string, ResonanzEntry[]>;
  expandedChunk: string | null; setExpandedChunk: (v: string | null) => void;
  selection: CitedSelection | null; setSelection: (v: CitedSelection | null) => void;
  modalOpen: boolean; setModalOpen: (v: boolean) => void;
  reading: ReadingSettings; updateReading: (patch: Partial<ReadingSettings>) => void;
  targetChunkId: string | null; fromConcept: string | null; onConsumeTarget: () => void;
  audio: AudioPlayerAPI; activeParaIdx: number;
  navigate: (to: string) => void;
}

export default function MobileReader({
  C, isDark, ebook, tocChapters, currentChapter, prevCh, nextCh,
  chapterChunks, chapterDisplay, chunkCount, globalChunkIndex,
  resonanzenByChunk, expandedChunk, setExpandedChunk,
  selection, setSelection, modalOpen, setModalOpen,
  reading, updateReading, targetChunkId, fromConcept, onConsumeTarget, audio, activeParaIdx, navigate,
}: Props) {
  const [indexOpen, setIndexOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [enkiduOpen, setEnkiduOpen] = useState(false);
  // Kapitel-Chat ("Frage zum Kapitel") — bewusst ein eigener Endpunkt
  // (/api/ask) und eigener Zustand, getrennt von Enkidu (/api/enkidu): eine
  // gezielte Rückfrage zum gerade gelesenen Kapitel statt eines offenen
  // Dialogs. Chat-Verlauf bleibt Sitzungs-lokal, wie im Desktop-Reader.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ q: string; a: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  async function askChapterQuestion() {
    const q = chatQuestion.trim();
    if (!q || !currentChapter || chatLoading) return;
    setChatQuestion("");
    setChatLoading(true);
    setChatHistory(prev => [...prev, { q, a: "" }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          chapterId: currentChapter.id,
          chapterTitle: currentChapter.title,
          chapterContent: currentChapter.content,
        }),
      });
      const data = await res.json();
      const answer = data.error
        ? (res.status === 429 ? `⏱ ${data.error}` : `Fehler: ${data.error}`)
        : data.answer;
      setChatHistory(prev => { const c = [...prev]; c[c.length - 1].a = answer; return c; });
    } catch {
      setChatHistory(prev => { const c = [...prev]; c[c.length - 1].a = "Verbindungsfehler. Bitte versuche es erneut."; return c; });
    } finally {
      setChatLoading(false);
    }
  }
  const [pageIdx, setPageIdx] = useState(0);
  const pendingEdge = useRef<"start" | "end" | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const readBodyFont = bodyFont(reading);
  // Glossar ist ein Nachschlagewerk, kein linearer Lesefluss — Seitenlauf
  // (ein Absatz pro "Seite") ergibt hier keinen Sinn, unabhängig von der
  // gewählten ReadingSettings.pageMode. Gilt fürs komplette Kapitel; die
  // Anfangsbuchstaben-Ansicht unten ersetzt die normale Absatz-Darstellung.
  const isGlossar = currentChapter?.id === "glossar";
  const paged = reading.pageMode === "paged" && !isGlossar;
  const glossaryGrouped = useMemo(
    () => isGlossar && currentChapter ? groupGlossaryByLetter(parseGlossaryEntries(currentChapter.content)) : null,
    [isGlossar, currentChapter],
  );

  // Mitlesen beim Vorlesen: im Fortlauf sanft zum aktiven Absatz scrollen,
  // im Seitenlauf blättert die Hörfassung die Seite selbst mit (eine Seite
  // zeigt genau einen Absatz — ohne Mitblättern liefe die Anzeige sonst
  // stumm hinter der Stimme her).
  useEffect(() => {
    if (activeParaIdx < 0 || activeParaIdx >= chapterChunks.length) return;
    if (paged) {
      if (activeParaIdx !== pageIdx) { setPageIdx(activeParaIdx); setExpandedChunk(null); }
      return;
    }
    const chunk = chapterChunks[activeParaIdx];
    const el = scrollContainerRef.current?.querySelector<HTMLElement>(`[data-chunk-id="${chunk.id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParaIdx, paged, chapterChunks]);

  // Kapitelwechsel/Deep-Link auflösen: Sprungziel-Chunk, sonst Kapitel-Rand
  // (von-vorne/-hinten reingeblättert), sonst Kapitelanfang.
  useEffect(() => {
    if (chapterChunks.length === 0) { setPageIdx(0); return; }
    if (targetChunkId) {
      const idx = chapterChunks.findIndex(c => c.id === targetChunkId);
      // Einmal-Sprungziel — sonst würde ein späteres Zurückblättern in
      // dasselbe Kapitel den Nutzer wieder an diese Stelle zwingen. Betrifft
      // NUR den Sprung; die "Aus dem Begriffsnetz"-Randnotiz (fromConcept)
      // bleibt bewusst stehen, bis das Kapitel wechselt (siehe WerkPage).
      onConsumeTarget();
      if (idx >= 0) {
        if (paged) { setPageIdx(idx); return; }
        // Fortlauf-Modus: kein Seiten-Index nötig (zeigt ohnehin alle
        // Absätze) — stattdessen direkt zur Zielstelle scrollen, sonst
        // würde der Sprung hier folgenlos bleiben.
        const targetId = chapterChunks[idx].id;
        requestAnimationFrame(() => {
          scrollContainerRef.current?.querySelector<HTMLElement>(`[data-chunk-id="${targetId}"]`)?.scrollIntoView({ behavior: "auto", block: "start" });
        });
        return;
      }
    }
    if (pendingEdge.current === "end") { setPageIdx(chapterChunks.length - 1); pendingEdge.current = null; return; }
    pendingEdge.current = null;
    setPageIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter?.id, chapterChunks.length]);

  // "Gelesen"-Tracking (wie im Desktop-Reader, Glossar/Literatur bewusst
  // ausgenommen — Nachschlagewerke, kein linearer Lesefortschritt). Zählt
  // erst als gelesen bei echtem Engagement: im Seitenlauf das Erreichen der
  // letzten Seite, im Fortlauf das tatsächliche Herunterscrollen bis (nahe)
  // zum Ende. Kein sofortiges Auto-Häkchen mehr für kurze Kapitel, die ohne
  // zu scrollen ins Bild passen — die zählen erst über die Hörfassung unten,
  // oder müssen (wie im Desktop-Reader) manuell markiert werden.
  const trackableChapter = currentChapter && currentChapter.id !== "glossar" && currentChapter.id !== "literatur" ? currentChapter : null;

  useEffect(() => {
    if (!trackableChapter || chapterChunks.length === 0) return;
    if (!paged) return;
    if (pageIdx >= chapterChunks.length - 1) markChapterComplete(trackableChapter.id);
  }, [paged, pageIdx, chapterChunks.length, trackableChapter]);

  useEffect(() => {
    if (paged || !trackableChapter) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      // >= 0.97 statt einer laxen Schwelle — "wirklich bis nach unten
      // gescrollt", mit etwas Toleranz für Rundungsfehler am Ende.
      if (max > 0 && el.scrollTop / max >= 0.97) markChapterComplete(trackableChapter.id);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [paged, trackableChapter]);

  // Hörfassung bis zum Ende durchgelesen: sowohl das MP3- als auch das
  // TTS-Ende in useAudioPlayer laufen auf denselben Signal-Zwilling hinaus
  // (playing → false UND activeParaIdx → -1, siehe speakParagraph/audio
  // "ended") — anders als ein reiner Pause-Klick, der activeParaIdx NICHT
  // zurücksetzt. wasPlayingRef pro Kapitel zurückgesetzt, damit ein
  // Kapitelwechsel während der Wiedergabe nicht fälschlich als "fertig
  // gehört" durchgeht.
  const wasPlayingRef = useRef(false);
  useEffect(() => { wasPlayingRef.current = false; }, [trackableChapter?.id]);
  useEffect(() => {
    if (!trackableChapter) return;
    if (wasPlayingRef.current && !audio.playing && activeParaIdx === -1) {
      markChapterComplete(trackableChapter.id);
    }
    wasPlayingRef.current = audio.playing;
  }, [audio.playing, activeParaIdx, trackableChapter]);

  function turnPage(dir: 1 | -1) {
    const next = pageIdx + dir;
    if (next < 0) {
      if (!prevCh) return;
      pendingEdge.current = "end";
      navigate(`/werk/${prevCh.id}`);
    } else if (next >= chapterChunks.length) {
      if (!nextCh) return;
      pendingEdge.current = "start";
      navigate(`/werk/${nextCh.id}`);
    } else {
      setPageIdx(next);
      setExpandedChunk(null);
    }
  }

  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) <= 48 || Math.abs(dx) <= Math.abs(dy) * 1.6) return;
    if (paged) {
      turnPage(dx < 0 ? 1 : -1);
    } else {
      // Fortlauf-Modus: kein Seiten-Konzept (ein Kapitel läuft durch) —
      // Wischen blättert hier direkt zum vorigen/nächsten Kapitel.
      if (dx < 0 && nextCh) navigate(`/werk/${nextCh.id}`);
      else if (dx > 0 && prevCh) navigate(`/werk/${prevCh.id}`);
    }
  }
  function onContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!paged) return;
    if (selection) return;
    const win = window.getSelection();
    if (win && !win.isCollapsed && win.toString().trim().length > 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    const box = e.currentTarget.getBoundingClientRect();
    const right = e.clientX - box.left > box.width * 0.5;
    turnPage(right ? 1 : -1);
  }

  const activeChunk = paged ? chapterChunks[pageIdx] : chapterChunks[0];
  const activeGlobalIdx = activeChunk ? globalChunkIndex(activeChunk.id) : -1;
  const pageLabel = activeGlobalIdx >= 0 && chunkCount > 0 ? `${activeGlobalIdx + 1} / ${chunkCount}` : "";
  const progressPct = activeGlobalIdx >= 0 && chunkCount > 0 ? Math.round(((activeGlobalIdx + 1) / chunkCount) * 100) : 0;
  const audioBarVisible = audio.hasAudio && (audio.playing || audio.currentTime > 0 || audio.progress > 0);
  const rateOptions = [1, 1.25, 1.5];

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      background: isDark ? PAPER.warmDark : PAPER.warmLight,
      paddingTop: "env(safe-area-inset-top, 0px)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <div
        ref={scrollContainerRef}
        data-scroll onClick={onContainerClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "22px 22px 8px" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.accentText }}>
            {currentChapter?.partTitle ?? ebook.meta.title}
          </span>
          {pageLabel && (
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", color: C.muted, fontVariantNumeric: "tabular-nums" }}>{pageLabel}</span>
          )}
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 28, lineHeight: 1.12, color: isDark ? PAPER.inkDark : PAPER.inkLight, marginBottom: 6 }}>
          {currentChapter?.title ?? "Werk"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ height: 1, flex: 1, background: C.border }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.accentText, opacity: 0.75 }}>❦</span>
          <span style={{ height: 1, flex: 1, background: C.border }} />
        </div>

        {fromConcept && (
          <div style={{ marginBottom: 18, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", background: C.surface }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5aacb8" }}>
              ❦ Aus dem Begriffsnetz · {fromConcept}
            </span>
          </div>
        )}

        {glossaryGrouped ? (
          <MobileGlossaryView C={C} grouped={glossaryGrouped} bodyFont={readBodyFont} fontScale={reading.fontScale} />
        ) : chapterChunks.length === 0 ? (
          <p style={{ fontStyle: "italic", color: C.muted }}>Kein Inhalt für dieses Kapitel verfügbar.</p>
        ) : paged ? (
          activeChunk && (
            <ParagraphBlock
              key={activeChunk.id} C={C} chunkId={activeChunk.id}
              text={chapterDisplay[pageIdx] ?? activeChunk.text}
              resonanzen={resonanzenByChunk.get(activeChunk.id)}
              isExpanded={expandedChunk === activeChunk.id}
              onToggle={() => setExpandedChunk(expandedChunk === activeChunk.id ? null : activeChunk.id)}
              fontScale={reading.fontScale} bodyFont={readBodyFont}
              isActive={activeParaIdx === pageIdx}
            />
          )
        ) : (
          chapterChunks.map((chunk, ci) => {
            const displayText = chapterDisplay[ci] ?? chunk.text;
            if (!displayText.trim()) return null;
            return (
              <ParagraphBlock
                key={chunk.id} C={C} chunkId={chunk.id} text={displayText}
                resonanzen={resonanzenByChunk.get(chunk.id)}
                isExpanded={expandedChunk === chunk.id}
                onToggle={() => setExpandedChunk(expandedChunk === chunk.id ? null : chunk.id)}
                fontScale={reading.fontScale} bodyFont={readBodyFont}
                isActive={activeParaIdx === ci}
              />
            );
          })
        )}

        <div style={{ display: "flex", justifyContent: "center", padding: "26px 0 6px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.45em", color: C.muted }}>⁂</div>
      </div>

      {selection && (
        <div style={{ position: "absolute", left: "50%", bottom: 104, transform: "translateX(-50%)", zIndex: 30 }}>
          <button
            type="button" onClick={() => setModalOpen(true)}
            style={{
              minHeight: 44, padding: "0 16px", background: C.accent, border: "none", borderRadius: 4,
              color: "#080808", fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.25)", whiteSpace: "nowrap",
            }}
          >◇ Resonanz erzeugen <span style={{ opacity: 0.7 }}>({selection.text.length} Z.)</span></button>
        </div>
      )}

      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.void }}>
        {audioBarVisible && (
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 16px", borderBottom: `1px solid ${C.border}` }}>
            <button
              type="button" onClick={audio.toggle}
              style={{ width: 34, height: 34, flexShrink: 0, border: `1px solid ${C.accentText}`, borderRadius: "50%", background: "none", color: C.accentText, fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
            >{audio.playing ? "❙❙" : "▸"}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", color: C.muted, marginBottom: 3 }}>
                HÖRT MIT · {audio.rate.toFixed(2).replace(/0$/, "").replace(".", ",")}×
              </div>
              <div style={{ height: 2, background: C.border, position: "relative" }}>
                <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${audio.progress}%`, background: C.accentText }} />
              </div>
            </div>
          </div>
        )}
        {audio.ttsUnavailable && (
          <div style={{ padding: "6px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.04em", color: C.muted }}>
            ⚠ Sprachausgabe auf diesem Gerät nicht verfügbar
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px" }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: C.textDim, fontVariantNumeric: "tabular-nums", paddingLeft: 6, minWidth: 56 }}>{pageLabel}</span>
          <div style={{ flex: 1, height: 1, background: C.border, position: "relative", margin: "0 4px" }}>
            <div style={{ position: "absolute", left: 0, top: -1, height: 3, width: `${progressPct}%`, background: C.accentText }} />
          </div>
          {audio.hasAudio && (
            <button type="button" onClick={audio.toggle} title="Hörfassung"
              style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: audio.playing ? C.accentText : C.text, fontFamily: MONO, fontSize: 14, cursor: "pointer" }}
            >▸</button>
          )}
          <button type="button" onClick={() => setSearchOpen(true)} title="Suche"
            style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.text, fontFamily: MONO, fontSize: 15, cursor: "pointer" }}
          >⌕</button>
          <button type="button" onClick={() => setPrefsOpen(true)} title="Lese-Einstellungen"
            style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.text, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 17, cursor: "pointer" }}
          >Aa</button>
          <button type="button" onClick={() => setChatOpen(true)} title="Frage zum Kapitel"
            style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.accentText, fontFamily: MONO, fontSize: 16, cursor: "pointer" }}
          >?</button>
          <button type="button" onClick={() => setEnkiduOpen(true)} title="Enkidu — Begegnung"
            style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.accentText, fontFamily: MONO, fontSize: 15, cursor: "pointer" }}
          >✦</button>
          <button type="button" onClick={() => setIndexOpen(true)} title="Inhalt"
            style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.text, fontFamily: MONO, fontSize: 15, cursor: "pointer" }}
          >≡</button>
        </div>
      </div>

      {modalOpen && selection && currentChapter && (
        <PassageResonanzModal
          C={C} chunkId={selection.chunkId} selectedText={selection.text} chapterTitle={currentChapter.title}
          onClose={() => { setModalOpen(false); setSelection(null); }}
        />
      )}

      {prefsOpen && (
        <MobileReadingSheet
          C={C} isDark={isDark} reading={reading} update={updateReading} audio={audio}
          rateOptions={rateOptions} onClose={() => setPrefsOpen(false)}
        />
      )}

      {indexOpen && (
        <MobileIndexOverlay
          C={C} tocChapters={tocChapters} navigate={navigate}
          onClose={() => setIndexOpen(false)} onSearch={() => setSearchOpen(true)}
        />
      )}

      {searchOpen && (
        <MobileSearchOverlay C={C} navigate={navigate} onClose={() => setSearchOpen(false)} />
      )}

      {enkiduOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, background: C.void }}>
          <Suspense fallback={null}>
            <EnkiduPage onClose={() => setEnkiduOpen(false)} />
          </Suspense>
        </div>
      )}

      {chatOpen && (
        <MobileChapterChatSheet
          C={C} chapterTitle={currentChapter?.title ?? ""}
          history={chatHistory} question={chatQuestion} setQuestion={setChatQuestion}
          loading={chatLoading} onAsk={askChapterQuestion} onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Aa-Einstellungen — Bottom-Sheet ───────────────────────────────────────

function MobileReadingSheet({
  C, isDark, reading, update, audio, rateOptions, onClose,
}: {
  C: Palette; isDark: boolean; reading: ReadingSettings; update: (p: Partial<ReadingSettings>) => void;
  audio: AudioPlayerAPI; rateOptions: number[]; onClose: () => void;
}) {
  const stepBtn: React.CSSProperties = {
    width: 44, height: 44, border: `1px solid ${C.border}`, borderRadius: 4, background: "none",
    color: C.text, fontFamily: "'Cormorant Garamond',serif", fontSize: 15, cursor: "pointer",
  };
  const pill = (label: string, active: boolean, onClick: () => void, key: string) => (
    <button
      key={key} type="button" onClick={onClick}
      style={{
        minHeight: 44, padding: "0 12px", cursor: "pointer", borderRadius: 4,
        border: `1px solid ${active ? C.accentText : C.border}`,
        background: active ? `${C.accent}1a` : "transparent",
        color: active ? C.accentText : C.textDim,
        fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
      }}
    >{label}</button>
  );
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 520, background: "rgba(0,0,0,0.22)" }} />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 521,
        background: C.surface, borderTop: `1px solid ${C.border}`, borderRadius: "10px 10px 0 0",
        padding: "14px 18px calc(26px + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <span style={{ width: 36, height: 3, borderRadius: 2, background: C.border, display: "block" }} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.muted }}>Lesen</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontFamily: MONO, fontSize: 14, cursor: "pointer", minHeight: 44, minWidth: 44 }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textDim }}>Darstellung</span>
            <div style={{ display: "flex", gap: 6 }}>
              {pill("Hell", !isDark, () => { if (isDark) toggleGlobalTheme(); }, "light")}
              {pill("Dunkel", isDark, () => { if (!isDark) toggleGlobalTheme(); }, "dark")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textDim }}>Schriftgröße</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={stepBtn} onClick={() => update({ fontScale: Math.max(FONT_SCALE_MIN, +(reading.fontScale - 0.05).toFixed(2)) })}>A−</button>
              <span style={{ minWidth: 52, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 11, color: C.accentText, fontVariantNumeric: "tabular-nums" }}>{Math.round(reading.fontScale * 100)}%</span>
              <button style={stepBtn} onClick={() => update({ fontScale: Math.min(FONT_SCALE_MAX, +(reading.fontScale + 0.05).toFixed(2)) })}>A+</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textDim }}>Zeilenbreite</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={stepBtn} onClick={() => update({ measure: Math.max(MEASURE_MIN, reading.measure - 2) })}>−</button>
              <span style={{ minWidth: 60, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 11, color: C.accentText, fontVariantNumeric: "tabular-nums" }}>{reading.measure} rem</span>
              <button style={stepBtn} onClick={() => update({ measure: Math.min(MEASURE_MAX, reading.measure + 2) })}>+</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textDim }}>Schriftart</span>
            <div style={{ display: "flex", gap: 6 }}>
              {pill("Serif", reading.serifBody, () => update({ serifBody: true }), "serif")}
              {pill("Sans", !reading.serifBody, () => update({ serifBody: false }), "sans")}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textDim }}>Seitenlauf</span>
            <div style={{ display: "flex", gap: 6 }}>
              {pill("Seiten", reading.pageMode === "paged", () => update({ pageMode: "paged" }), "paged")}
              {pill("Fortlauf", reading.pageMode === "scroll", () => update({ pageMode: "scroll" }), "scroll")}
            </div>
          </div>
          {audio.hasAudio && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textDim }}>Hörfassung</span>
              <div style={{ display: "flex", gap: 6 }}>
                {rateOptions.map(r => pill(`${r.toFixed(2).replace(/0$/, "").replace(".", ",")}×`, audio.rate === r, () => audio.setRate(r), "r" + r))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Frage zum Kapitel — Bottom-Sheet ──────────────────────────────────────
// Eigener Endpunkt (/api/ask), eigener Zustand — bewusst getrennt von Enkidu
// (/api/enkidu): eine gezielte Rückfrage zum aktuellen Kapitel statt eines
// offenen Dialogs. Im Desktop-Reader ein schwebendes Panel unten rechts;
// hier als Bottom-Sheet, da ein 360px-Floating-Panel auf einem Telefon
// keinen Platz hat.
function MobileChapterChatSheet({
  C, chapterTitle, history, question, setQuestion, loading, onAsk, onClose,
}: {
  C: Palette; chapterTitle: string;
  history: { q: string; a: string }[]; question: string; setQuestion: (v: string) => void;
  loading: boolean; onAsk: () => void; onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, loading]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 520, background: "rgba(0,0,0,0.22)" }} />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 521,
        background: C.surface, borderTop: `1px solid ${C.border}`, borderRadius: "10px 10px 0 0",
        display: "flex", flexDirection: "column", height: "min(72vh, 560px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0", flexShrink: 0 }}>
          <span style={{ width: 36, height: 3, borderRadius: 2, background: C.border, display: "block" }} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 18px 8px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: C.accentText }}>? Frage zum Kapitel</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontFamily: MONO, fontSize: 14, cursor: "pointer", minHeight: 44, minWidth: 44 }}>×</button>
        </div>
        {chapterTitle && (
          <div style={{ padding: "6px 18px", fontFamily: SERIF, fontStyle: "italic", fontSize: 12, color: C.muted, flexShrink: 0 }}>
            Kontext: {chapterTitle}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 18px" }}>
          {history.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 10px", color: C.muted }}>
              <div style={{ fontSize: 26, opacity: 0.4, marginBottom: 8 }}>?</div>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, margin: 0 }}>Stelle eine Frage zum aktuellen Kapitel.</p>
              <p style={{ fontFamily: MONO, fontSize: 9.5, marginTop: 6, opacity: 0.7 }}>Die Antwort bezieht sich auf den Inhalt und das Gesamtwerk.</p>
            </div>
          )}
          {history.map((entry, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                <div style={{ maxWidth: "85%", borderRadius: "14px 14px 3px 14px", padding: "8px 12px", fontFamily: SERIF, fontSize: 13, background: C.accent, color: "#080808" }}>
                  {entry.q}
                </div>
              </div>
              {entry.a ? (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ maxWidth: "85%", borderRadius: "14px 14px 14px 3px", padding: "8px 12px", fontFamily: SERIF, fontSize: 13, lineHeight: 1.55, background: C.deep, color: C.text }}>
                    {entry.a.split("\n\n").map((p, j) => <p key={j} style={{ margin: j > 0 ? "8px 0 0" : 0 }}>{p}</p>)}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ borderRadius: "14px 14px 14px 3px", padding: "8px 14px", background: C.deep, fontFamily: MONO, fontSize: 13, color: C.accentText }}>…</div>
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div style={{ display: "flex", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <input
            type="text" value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAsk(); } }}
            placeholder="Frage stellen …"
            style={{
              flex: 1, minHeight: 40, padding: "0 12px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: C.deep, color: C.text,
              fontFamily: SERIF, fontSize: 14, outline: "none",
            }}
          />
          <button
            type="button" onClick={onAsk} disabled={!question.trim() || loading}
            style={{
              minWidth: 44, minHeight: 40, borderRadius: 6, border: "none",
              background: C.accent, color: "#080808", fontFamily: MONO, fontSize: 13,
              cursor: loading ? "wait" : "pointer", opacity: (!question.trim() || loading) ? 0.5 : 1,
            }}
          >➤</button>
        </div>
      </div>
    </>
  );
}

// ─── Glossar — Anfangsbuchstaben-Register ──────────────────────────────────
// Der Desktop-Reader hat dafür eine eigene Ansicht (Home.tsx,
// renderGlossarContent) statt des normalen Absatz-Fließtexts — hier das
// mobile Gegenstück: horizontal scrollbares Buchstaben-Register statt des
// Desktop-Zeilenumbruchs (auf einem Telefon ist dafür keine Breite), tippen
// springt zum jeweiligen Abschnitt.
function MobileGlossaryView({
  C, grouped, bodyFont, fontScale,
}: {
  C: Palette; grouped: Map<string, { term: string; definition: string }[]>; bodyFont: string; fontScale: number;
}) {
  const letters = Array.from(grouped.keys());
  return (
    <div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6,
        position: "sticky", top: 0, zIndex: 5, background: C.void,
        padding: "4px 0 12px", marginBottom: 8, borderBottom: `1px solid ${C.border}`,
      }}>
        {letters.map(letter => (
          <button
            key={letter} type="button"
            onClick={() => document.getElementById(`mobile-glossar-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{
              flexShrink: 0, width: 30, height: 30, borderRadius: 6, border: `1px solid ${C.border}`,
              background: "none", color: C.accentText, fontFamily: MONO, fontSize: 12, cursor: "pointer",
            }}
          >{letter}</button>
        ))}
      </div>

      {Array.from(grouped.entries()).map(([letter, items]) => (
        <section key={letter} id={`mobile-glossar-${letter}`} style={{ marginBottom: 26, scrollMarginTop: 84 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: C.accentText, borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 12 }}>
            {letter}
          </div>
          {items.map((entry, i) => (
            <div key={`${letter}-${i}`} style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: `${1.02 * fontScale}rem`, color: C.textBright, marginBottom: 3 }}>
                {entry.term}
              </div>
              <div style={{ fontFamily: bodyFont, fontSize: `${0.95 * fontScale}rem`, lineHeight: 1.6, color: C.textDim }}>
                {entry.definition}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
