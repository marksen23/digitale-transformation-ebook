import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu, X, Download, Search,
  BookOpen, Sun, Moon, ChevronUp, Type, Minus, Plus, Bookmark,
  MessageCircleQuestion, Send, Loader2, Languages, Sparkles, Smartphone,
  PanelLeftClose, PanelLeft, Mic, MicOff,
  SkipBack, SkipForward, Play, Pause, Headphones, Network, PenLine, CheckCircle2,
  Maximize2, Minimize2, ChevronRight, SlidersHorizontal,
} from 'lucide-react';
import { parseEbookMarkdown, type EbookData, type Chapter } from '@/lib/parseEbook';
const EnkiduPage      = lazy(() => import('./EnkiduPage'));
const ConceptGraphPage = lazy(() => import('./ConceptGraphPage'));
import { useSpeechRecognition } from '@/hooks/useSpeech';
import { useAudioPlayer, type VoiceGender } from '@/hooks/useAudioPlayer';

// ─── Helpers ────────────────────────────────────────────────────────
function useLocalStorage<T>(key: string, fallback: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    const resolveFallback = () =>
      typeof fallback === 'function' ? (fallback as () => T)() : fallback;
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : resolveFallback(); }
    catch { return resolveFallback(); }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}

/** Sekunden → MM:SS */
function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Lazy-load fallback ─────────────────────────────────────────────
function OverlayLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: '#080808', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 32, height: 32, border: '2px solid #2a2a2a',
        borderTopColor: '#c4a882', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export default function Home() {
  // Data
  const [ebook, setEbook] = useState<EbookData | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation
  const [currentId, setCurrentId] = useLocalStorage<string>('ebook-chapter', '__cover__');
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [burgerMenuOpen, setBurgerMenuOpen] = useState(false);
  const [enkiduOpen, setEnkiduOpen] = useState(false);
  const [conceptGraphOpen, setConceptGraphOpen] = useState(false);
  const [personalizationOpen, setPersonalizationOpen] = useState(false);

  // Features
  const [darkMode, setDarkMode] = useLocalStorage('ebook-dark', false);
  const [fontSize, setFontSize] = useLocalStorage('ebook-fontsize', 1); // 0=small 1=normal 2=large 3=xlarge
  const [fontFamily, setFontFamily] = useLocalStorage<string>('ebook-fontfamily', 'serif');
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [language, setLanguage] = useLocalStorage<string>('ebook-language', 'de');
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [headphonesMenuOpen, setHeadphonesMenuOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const translationCache = useRef<Map<string, string>>(new Map());
  const [translationTick, setTranslationTick] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Chapter[]>([]);
  const [bookmarks, setBookmarks] = useLocalStorage<string[]>('ebook-bookmarks', []);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readProgress, setReadProgress] = useState(0);

  // Q&A Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<{ q: string; a: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ─── Audio Player — State (Hook-Initialisierung weiter unten nach currentChapter) ──
  const [audioVoice, setAudioVoice] = useLocalStorage<VoiceGender>('ebook-audio-voice', 'female');
  // Aktiver Paragraphen-Index (gesetzt vom useAudioPlayer-Callback)
  const [audioActiveParagraph, setAudioActiveParagraph] = useState(-1);

  // STT for Q&A chat input
  const chatStt = useSpeechRecognition((text) => {
    setChatQuestion(q => q ? q + ' ' + text : text);
  });

  // Keyboard shortcuts help panel
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Chapter notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useLocalStorage<Record<string, string>>('ebook-notes', {});

  // Chapter completion tracking
  const [completedChapters, setCompletedChapters] = useLocalStorage<string[]>('ebook-completed', []);
  const toggleCompleted = useCallback((id: string) => {
    setCompletedChapters(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }, [setCompletedChapters]);

  // Tiefenlese-Modus — Sidebar verstecken, volle Konzentration auf Text
  const [focusMode, setFocusMode] = useState(false);

  // Buch-Schwellen-Overlay — beim Wechsel zwischen den drei Bänden
  const [buchSchwelle, setBuchSchwelle] = useState<{
    title: string; subtitle?: string; romanNum: string;
  } | null>(null);

  // Scroll position restoration — keyed by chapter id, in-memory
  const scrollPositions = useRef<Record<string, number>>({});

  // Keyword popover
  const [activeKeyword, setActiveKeyword] = useState<{ term: string; definition: string; x: number; y: number } | null>(null);

  // Watermark ID (anonymer Session-Fingerprint, pro Gerät einmalig generiert)
  const [watermarkId] = useLocalStorage<string>('ebook-wm-id', () => {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(2));
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const date = new Date().toISOString().slice(0, 10);
      return `DT-${hex}-${date}`;
    } catch {
      const date = new Date().toISOString().slice(0, 10);
      return `DT-XXXX-${date}`;
    }
  });

  // Print/PDF blocker UI state
  const [printBlocked, setPrintBlocked] = useState(false);

  // PWA Install Prompt
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Service-Worker-Update-Toast
  const [swNeedsRefresh, setSwNeedsRefresh] = useState(false);
  const swUpdateRef = useRef<(() => Promise<void>) | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load ebook
  useEffect(() => {
    fetch('/ebook_content.md')
      .then(r => r.text())
      .then(text => {
        const data = parseEbookMarkdown(text);
        setEbook(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // PWA Install Prompt abfangen
  useEffect(() => {
    // Prüfe ob bereits installiert (standalone/fullscreen)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    if (isStandalone) setIsInstalled(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const onInstalled = () => setIsInstalled(true);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Print/PDF-Schutz: Hinweis statt Inhalt anzeigen
  useEffect(() => {
    const onBeforePrint = () => setPrintBlocked(true);
    const onAfterPrint = () => setPrintBlocked(false);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  // Copy-Schutz: Kopieren des Ebook-Inhalts unterbinden
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      // Erlaubt Kopieren in Eingabefeldern (Suche, Chat)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', 'Kopieren ist für dieses Werk nicht gestattet.');
    };
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  // Service Worker Update-Benachrichtigung
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let swIntervalId: ReturnType<typeof setInterval> | undefined;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          onNeedRefresh() {
            if (!cancelled) setSwNeedsRefresh(true);
          },
          onRegisteredSW(_swUrl, registration) {
            if (registration) {
              // Regelmäßig auf Updates prüfen (1x/Stunde)
              swIntervalId = setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
            }
          },
        });
        swUpdateRef.current = updateSW;
      })
      .catch(() => {
        /* SW-Registrierung nur in production-Build verfügbar */
      });
    return () => {
      cancelled = true;
      clearInterval(swIntervalId); // Memory-Leak-Fix: Interval beim Unmount aufräumen
    };
  }, []);

  // Scroll tracking — also save position for restoration
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      scrollPositions.current[currentId] = el.scrollTop;
      setShowScrollTop(el.scrollTop > 400);
      const total = el.scrollHeight - el.clientHeight;
      const pct = total > 0 ? Math.round((el.scrollTop / total) * 100) : 0;
      setReadProgress(pct);
      // Auto-mark chapter as completed when ≥ 80% scrolled through
      if (pct >= 80 && currentId !== '__cover__' && currentId !== 'glossar' && currentId !== 'literatur') {
        setCompletedChapters(prev => prev.includes(currentId) ? prev : [...prev, currentId]);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [currentId]);

  // Restore saved scroll position on chapter change (default: top)
  useEffect(() => {
    const saved = scrollPositions.current[currentId] ?? 0;
    // rAF ensures the new chapter content is rendered before scrolling
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: saved, behavior: 'instant' });
    });
  }, [currentId]);


  // Search
  useEffect(() => {
    if (!ebook || !searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const results = ebook.chapters.filter(ch =>
      ch.content.toLowerCase().includes(q) || ch.title.toLowerCase().includes(q)
    );
    setSearchResults(results);
  }, [searchQuery, ebook]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [searchOpen]);

  const currentChapter = ebook ? ebook.chapters.find(c => c.id === currentId) : undefined;

  // Auto-expand the part containing the current chapter (sidebar accordion)
  useEffect(() => {
    if (!currentChapter?.part) return;
    setExpandedParts(prev => prev.has(currentChapter.part!) ? prev : new Set(prev).add(currentChapter.part!));
  }, [currentChapter?.part]);

  // ─── Audio Player — Init (nach currentChapter, da plainParagraphs davon abhängt) ──
  const plainParagraphs = useMemo(() => {
    if (!currentChapter) return [];
    return currentChapter.content
      .split('\n\n')
      .map(p => p.trim()
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s*/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1'))
      .filter(Boolean);
  }, [currentChapter]);

  const audio = useAudioPlayer(
    currentId !== '__cover__' ? currentId : null,
    audioVoice,
    {
      plainParagraphs,
      onParaChange: (idx) => {
        setAudioActiveParagraph(idx);
        if (idx >= 0) {
          const el = document.querySelector(`[data-audio-para="${idx}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      },
    }
  );

  // Audio-Paragraph-Highlight zurücksetzen wenn Kapitel wechselt
  useEffect(() => { setAudioActiveParagraph(-1); }, [currentId]);

  // Build glossary keyword map from the glossar chapter
  const glossaryMap = useMemo(() => {
    if (!ebook) return new Map<string, string>();
    const glossarChapter = ebook.chapters.find(c => c.id === 'glossar');
    if (!glossarChapter) return new Map<string, string>();

    const map = new Map<string, string>();
    const lines = glossarChapter.content.split('\n');
    let currentTerm = '';
    let currentDef = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-()„"]+?)\s{2,}(.+)$/);
      if (match) {
        if (currentTerm) map.set(currentTerm, currentDef.trim());
        currentTerm = match[1].trim();
        currentDef = match[2];
      } else if (currentTerm) {
        currentDef += ' ' + trimmed;
      }
    }
    if (currentTerm) map.set(currentTerm, currentDef.trim());
    return map;
  }, [ebook]);

  // Build keyword index: which terms appear in which chapters
  const keywordIndex = useMemo(() => {
    if (!ebook || glossaryMap.size === 0) return new Map<string, string[]>();
    const index = new Map<string, string[]>();
    const terms = Array.from(glossaryMap.keys());
    for (const ch of ebook.chapters) {
      if (ch.id === 'glossar' || ch.id === 'literatur') continue;
      const lower = ch.content.toLowerCase();
      for (const term of terms) {
        if (lower.includes(term.toLowerCase())) {
          const list = index.get(term) || [];
          list.push(ch.id);
          index.set(term, list);
        }
      }
    }
    return index;
  }, [ebook, glossaryMap]);

  // Q&A submit
  const askQuestion = useCallback(async () => {
    if (!chatQuestion.trim() || !currentChapter || chatLoading) return;
    const q = chatQuestion.trim();
    setChatQuestion('');
    setChatLoading(true);
    setChatHistory(prev => [...prev, { q, a: '' }]);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          chapterId: currentChapter.id,
          chapterTitle: currentChapter.title,
          chapterContent: currentChapter.content,
        }),
      });
      const data = await res.json();
      if (data.error) {
        const msg = res.status === 429
          ? `⏱ ${data.error}`
          : `Fehler: ${data.error}`;
        setChatHistory(prev => {
          const copy = [...prev];
          copy[copy.length - 1].a = msg;
          return copy;
        });
      } else {
        setChatHistory(prev => {
          const copy = [...prev];
          copy[copy.length - 1].a = data.answer;
          return copy;
        });
      }
    } catch {
      setChatHistory(prev => {
        const copy = [...prev];
        copy[copy.length - 1].a = 'Verbindungsfehler. Bitte versuche es erneut.';
        return copy;
      });
    } finally {
      setChatLoading(false);
    }
  }, [chatQuestion, currentChapter, chatLoading]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  // Close keyword popover on chapter change or scroll
  useEffect(() => { setActiveKeyword(null); }, [currentId]);

  // Render text with keyword highlighting
  const renderWithKeywords = useCallback((text: string, chapterId: string): ReactNode => {
    if (glossaryMap.size === 0 || chapterId === 'glossar' || chapterId === 'literatur') return text;

    // Build regex from glossary terms, longest first to avoid partial matches
    const terms = Array.from(glossaryMap.keys()).sort((a, b) => b.length - a.length);
    const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escaped.join('|')})`, 'gi');

    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const seen = new Set<string>(); // Only highlight first occurrence per paragraph

    while ((match = regex.exec(text)) !== null) {
      const matchedText = match[0];
      const termKey = terms.find(t => t.toLowerCase() === matchedText.toLowerCase());
      if (!termKey || seen.has(termKey.toLowerCase())) continue;
      seen.add(termKey.toLowerCase());

      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const def = glossaryMap.get(termKey) || '';
      parts.push(
        <button
          key={`${match.index}-${termKey}`}
          className={`underline decoration-dotted decoration-amber-500/50 underline-offset-2 cursor-help hover:decoration-amber-500 transition-colors ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setActiveKeyword({ term: termKey, definition: def, x: rect.left, y: rect.bottom + 8 });
          }}
        >
          {matchedText}
        </button>
      );
      lastIndex = match.index + matchedText.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts.length > 0 ? parts : text;
  }, [glossaryMap, darkMode]);

  // Navigation helpers
  const allIds = useMemo(() => {
    if (!ebook) return ['__cover__'];
    return ['__cover__', ...ebook.chapters.map(c => c.id)];
  }, [ebook]);

  const currentIndex = allIds.indexOf(currentId);

  const goNext = useCallback(() => {
    if (currentIndex < allIds.length - 1) setCurrentId(allIds[currentIndex + 1]);
  }, [currentIndex, allIds, setCurrentId]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentId(allIds[currentIndex - 1]);
  }, [currentIndex, allIds, setCurrentId]);

  const navigateTo = useCallback((id: string) => {
    // Buch-Schwelle: beim Wechsel zu einer Titelseite eines anderen Bandes
    // zeigen wir kurz einen Übergangsmoment — die Schwelle als sichtbaren Ort
    if (ebook) {
      const target = ebook.chapters.find(c => c.id === id);
      const current = ebook.chapters.find(c => c.id === currentId);
      const romanNums: Record<string, string> = { band1: 'I', band2: 'II', band3: 'III' };
      if (
        target?.isTitlePage &&
        current &&
        target.part !== current.part &&
        romanNums[target.part]
      ) {
        setBuchSchwelle({
          title: target.title.replace(/^Band\s+[IVX]+:\s*/i, ''),
          subtitle: target.subtitle,
          romanNum: romanNums[target.part],
        });
        setSidebarOpen(false);
        setTimeout(() => {
          setBuchSchwelle(null);
          setCurrentId(id);
          setSearchOpen(false);
          setSearchQuery('');
        }, 2500);
        return;
      }
    }
    setCurrentId(id);
    setSidebarOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
  }, [currentId, ebook, setCurrentId]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  }, [setBookmarks]);

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement ||
             el instanceof HTMLTextAreaElement ||
             (el instanceof HTMLElement && el.isContentEditable);
    };

    const handler = (e: KeyboardEvent) => {
      // Escape always closes active panels, highest priority first
      if (e.key === 'Escape') {
        if (shortcutsOpen)      { setShortcutsOpen(false); return; }
        if (notesOpen)          { setNotesOpen(false); return; }
        if (conceptGraphOpen)   { setConceptGraphOpen(false); return; }
        if (enkiduOpen)         { setEnkiduOpen(false); return; }
        if (searchOpen)         { setSearchOpen(false); setSearchQuery(''); return; }
        if (chatOpen)           { setChatOpen(false); return; }
        if (fontMenuOpen)       { setFontMenuOpen(false); return; }
        if (languageMenuOpen)   { setLanguageMenuOpen(false); return; }
        if (headphonesMenuOpen) { setHeadphonesMenuOpen(false); return; }
        if (burgerMenuOpen)     { setBurgerMenuOpen(false); return; }
        return;
      }

      // No content shortcuts while typing into inputs
      if (isTyping()) return;
      if (e.metaKey || e.altKey) return;

      if (e.ctrlKey) {
        if (e.key === 'f') {
          e.preventDefault();
          setSearchOpen(o => !o);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowRight': case ']':
          e.preventDefault(); goNext(); break;
        case 'ArrowLeft': case '[':
          e.preventDefault(); goPrev(); break;
        case '/':
          e.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
          break;
        case 'b':
          if (currentId !== '__cover__') toggleBookmark(currentId); break;
        case 'c':
          if (currentId !== '__cover__' && currentId !== 'glossar' && currentId !== 'literatur') toggleCompleted(currentId); break;
        case 'd': setDarkMode(v => !v); break;
        case 't': setSidebarOpen(v => !v); break;
        case 'f': setFocusMode(v => { if (!v) setSidebarOpen(false); return !v; }); break;
        case 'e': setEnkiduOpen(v => !v); break;
        case 'n': setConceptGraphOpen(v => !v); break;
        case '?': setShortcutsOpen(v => !v); break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    shortcutsOpen, notesOpen, conceptGraphOpen, enkiduOpen, searchOpen, chatOpen,
    fontMenuOpen, languageMenuOpen, headphonesMenuOpen, burgerMenuOpen,
    goNext, goPrev, currentId, toggleBookmark, toggleCompleted,
    setDarkMode, setSidebarOpen, setEnkiduOpen, setConceptGraphOpen,
    setSearchOpen, setSearchQuery, setBurgerMenuOpen, setFocusMode,
  ]);

  // Globaler Click-Handler: alle Dropdown-Overlays bei Klick auf Hintergrund schließen.
  // Die Menü-Buttons und -Container rufen bereits e.stopPropagation() auf, daher
  // erreichen Klicks *innerhalb* der Menus diesen Handler nie.
  useEffect(() => {
    const closeAll = () => {
      setBurgerMenuOpen(false);
      setFontMenuOpen(false);
      setLanguageMenuOpen(false);
      setHeadphonesMenuOpen(false);
    };
    document.addEventListener('click', closeAll);
    return () => document.removeEventListener('click', closeAll);
  }, []);

  const fontSizeClasses = ['text-sm leading-relaxed', 'text-base leading-relaxed', 'text-lg leading-relaxed', 'text-xl leading-loose'];

  const fontFamilyMap: Record<string, string> = {
    serif: 'font-serif',
    sans: 'font-sans',
    mono: 'font-mono',
    lora: '',
    merriweather: '',
    opendyslexic: '',
  };
  const fontFamilyStyle: Record<string, React.CSSProperties> = {
    serif: {},
    sans: {},
    mono: {},
    lora: { fontFamily: '"Lora", serif' },
    merriweather: { fontFamily: '"Merriweather", serif' },
    opendyslexic: { fontFamily: '"OpenDyslexic", "Comic Sans MS", sans-serif' },
  };
  const fontFamilyOptions: { key: string; label: string }[] = [
    { key: 'serif', label: 'Serif (Standard)' },
    { key: 'sans', label: 'Sans-serif' },
    { key: 'mono', label: 'Monospace' },
    { key: 'lora', label: 'Lora' },
    { key: 'merriweather', label: 'Merriweather' },
    { key: 'opendyslexic', label: 'OpenDyslexic' },
  ];
  const fontClass = fontFamilyMap[fontFamily] ?? 'font-serif';
  const fontStyle = fontFamilyStyle[fontFamily] ?? {};

  const languageOptions: { code: string; label: string }[] = [
    { code: 'de', label: 'Deutsch (Original)' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'es', label: 'Español' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'tr', label: 'Türkçe' },
    { code: 'pl', label: 'Polski' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'zh', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ar', label: 'العربية' },
  ];
  const languageLabel = languageOptions.find(l => l.code === language)?.label || language;

  // ─── Audio Player derived values ────────────────────────────────────
  const isPlaying = audio.playing;
  // Fortschritts-Anzeige: Audio-Fortschritt wenn aktiv, sonst Scroll-Fortschritt
  const displayProgress = isPlaying ? audio.progress : readProgress;

  // Translate the current chapter when language ≠ 'de'
  useEffect(() => {
    if (!currentChapter) return;
    if (language === 'de') { setTranslationError(null); return; }
    if (currentChapter.id === 'glossar' || currentChapter.id === 'literatur') return;
    const cacheKey = `${currentChapter.id}::${language}`;
    if (translationCache.current.has(cacheKey)) return;

    let cancelled = false;
    setTranslating(true);
    setTranslationError(null);
    (async () => {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currentChapter.content,
            targetLang: language,
            sourceLang: 'de',
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setTranslationError(
            res.status === 429 ? `⏱ ${data.error}` : data.error
          );
        } else if (data.translation) {
          translationCache.current.set(cacheKey, data.translation);
          setTranslationTick(t => t + 1);
        }
      } catch {
        if (!cancelled) setTranslationError('Verbindungsfehler bei der Übersetzung.');
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentChapter, language]);

  // Wort-Spans für Audio-Highlighting: gibt Nodes + Wortanzahl zurück.
  // Wird nur im Paragraph-Renderer aufgerufen wenn Audio+Timestamps aktiv.
  const renderWithWordSpans = useCallback((text: string, wordOffset: number): { nodes: React.ReactNode[], wordCount: number } => {
    const tokens = text.split(/(\s+)/);
    const nodes: React.ReactNode[] = [];
    let idx = wordOffset;
    let wordCount = 0;
    for (const token of tokens) {
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        nodes.push(token);
      } else {
        nodes.push(<span key={idx} data-wi={idx}>{token}</span>);
        idx++;
        wordCount++;
      }
    }
    return { nodes, wordCount };
  }, []);

  // Baut ein dezentes, kacheliges SVG-Wasserzeichen als data-URL
  const watermarkStyle = useMemo(() => {
    const fill = darkMode ? '%23f5f5f4' : '%231e1b4b';
    const opacity = darkMode ? '0.08' : '0.05';
    const text = `Lizenziert für ${watermarkId}`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='260' viewBox='0 0 420 260'>` +
      `<g transform='rotate(-28 210 130)' fill='${fill}' fill-opacity='${opacity}' font-family='Georgia, serif' font-size='16' font-style='italic'>` +
      `<text x='50%' y='45%' text-anchor='middle'>${text}</text>` +
      `<text x='50%' y='62%' text-anchor='middle' font-size='11' letter-spacing='3'>DIGITALE TRANSFORMATION · TRILOGIE</text>` +
      `</g></svg>`;
    return {
      backgroundImage: `url("data:image/svg+xml;utf8,${svg}")`,
      backgroundRepeat: 'repeat' as const,
      backgroundSize: '420px 260px',
    };
  }, [darkMode, watermarkId]);

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-stone-950 text-stone-200' : 'bg-stone-50 text-stone-800'}`}>
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="font-serif text-lg">Wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!ebook) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-red-600">Fehler beim Laden des Ebooks.</p>
      </div>
    );
  }

  const renderCover = () => (
    <div className={`min-h-full flex items-center justify-center p-4 sm:p-6 ${darkMode ? 'bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950' : 'bg-gradient-to-br from-indigo-950 via-indigo-900 to-stone-900'}`}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-lg w-full"
      >
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-10 text-center space-y-8">
          <div className="space-y-2">
            <p className="text-amber-400 text-xs tracking-[0.3em] uppercase font-medium">Markus Oehring</p>
            <div className="w-16 h-px bg-amber-500/50 mx-auto" />
          </div>

          <div className="space-y-4">
            <h1 className="text-[clamp(1.75rem,8vw,3rem)] md:text-5xl font-serif text-white tracking-tight leading-tight break-words">
              Die Digitale<br />Transformation
            </h1>
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent mx-auto" />
            <p className="text-stone-300 text-sm md:text-base font-serif italic max-w-sm mx-auto leading-relaxed">
              Eine poetisch-philosophische Trilogie<br />mit theoretischer Grundlegung<br />in drei Kritiken
            </p>
          </div>

          <div className="space-y-3 text-stone-400 text-xs">
            <div className="space-y-1">
              <p>Band I: Die Überführung &mdash; Gilgamesch im digitalen Zeitalter</p>
              <p>Band II: Der Ausgang &mdash; Kant im Zeitalter der Maschinenvernunft</p>
              <p>Band III: Die Rückbindung &mdash; Resonanz im Zeitalter der Entfremdung</p>
            </div>
            <div className="w-8 h-px bg-stone-700 mx-auto" />
            <p>März 2026</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <button
              onClick={() => navigateTo('vorwort')}
              className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors text-sm"
            >
              <BookOpen size={16} className="inline mr-2 -mt-0.5" />
              Lesen
            </button>
            {!isInstalled && (
              <button
                onClick={async () => {
                  if (installPrompt && 'prompt' in installPrompt) {
                    (installPrompt as any).prompt();
                    const result = await (installPrompt as any).userChoice;
                    if (result.outcome === 'accepted') setIsInstalled(true);
                    setInstallPrompt(null);
                  } else {
                    // Fallback für iOS Safari (kein beforeinstallprompt)
                    alert('Tippe auf „Teilen" ➜ „Zum Home-Bildschirm" um die App zu installieren.');
                  }
                }}
                className="px-8 py-3 border border-amber-600/50 text-amber-400 hover:bg-amber-600/10 rounded-lg font-medium transition-colors text-sm inline-flex items-center justify-center gap-2"
              >
                <Smartphone size={16} />
                Installieren
              </button>
            )}
            <a
              href={`/api/pdf?wm=${encodeURIComponent(watermarkId)}`}
              className="px-8 py-3 border border-amber-600/50 text-amber-400 hover:bg-amber-600/10 rounded-lg font-medium transition-colors text-sm inline-flex items-center justify-center gap-2"
            >
              <Download size={16} />
              PDF
            </a>
          </div>
        </div>

        <p className="text-center text-stone-500 text-xs mt-6">
          {ebook.meta.copyright}
        </p>
      </motion.div>
    </div>
  );

  const renderBandTitlePage = (chapter: Chapter) => {
    // Extract Band number from id (band1-title, band2-title, band3-title)
    const bandNum = chapter.id.replace('-title', '').replace('band', '');
    const romanNum = { '1': 'I', '2': 'II', '3': 'III' }[bandNum] || bandNum;

    // Minimale Schwellen-Seite — Atemraum statt Inhalt.
    // Die Animation übernimmt die Zeremonie; diese Seite ist der stille Ort danach.
    return (
      <div className={`min-h-full flex items-center justify-center ${darkMode ? 'bg-stone-950' : 'bg-stone-50'}`}>
        <motion.div
          key={chapter.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="text-center px-10 max-w-md"
        >
          {/* Cuneiform glyph — Symbol des Übergangs */}
          <div className={`text-4xl mb-10 select-none ${darkMode ? 'text-amber-800/40' : 'text-amber-700/25'}`}>
            𒀭
          </div>

          <p className={`text-[10px] tracking-[0.5em] uppercase font-mono mb-8 ${darkMode ? 'text-amber-700/60' : 'text-amber-700/50'}`}>
            Band {romanNum}
          </p>

          <div className="w-16 h-px mx-auto mb-8"
               style={{ background: darkMode
                 ? 'linear-gradient(to right, transparent, rgba(217,119,6,0.3), transparent)'
                 : 'linear-gradient(to right, transparent, rgba(180,83,9,0.25), transparent)' }} />

          <h1 className={`font-serif text-2xl md:text-3xl tracking-tight leading-snug mb-5 ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>
            {chapter.title.replace(/^Band\s+[IVX]+:\s*/i, '')}
          </h1>

          {chapter.subtitle && (
            <p className={`font-serif italic text-base leading-relaxed mb-10 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
              {chapter.subtitle}
            </p>
          )}

          {chapter.description && (
            <>
              <div className="w-8 h-px mx-auto mb-8"
                   style={{ background: darkMode ? 'rgba(68,64,60,0.8)' : 'rgba(214,211,209,0.8)' }} />
              <p className={`font-serif text-sm leading-loose ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                {chapter.description}
              </p>
            </>
          )}
        </motion.div>
      </div>
    );
  };

  const renderGlossarContent = (chapter: Chapter) => {
    // Parse glossary entries: "Term  Definition text..." pattern
    const entries: { term: string; definition: string }[] = [];
    const lines = chapter.content.split('\n');
    let currentTerm = '';
    let currentDef = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(/^([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-()„"]+?)\s{2,}(.+)$/);
      if (match) {
        if (currentTerm) {
          entries.push({ term: currentTerm, definition: currentDef.trim() });
        }
        currentTerm = match[1].trim();
        currentDef = match[2];
      } else if (currentTerm) {
        currentDef += ' ' + trimmed;
      }
    }
    if (currentTerm) {
      entries.push({ term: currentTerm, definition: currentDef.trim() });
    }

    // Sort alphabetically (German collation)
    entries.sort((a, b) => a.term.localeCompare(b.term, 'de'));

    // Extract intro text (lines before the first definition entry)
    const introEnd = entries[0] ? chapter.content.indexOf(entries[0].term) : -1;
    const intro = introEnd > 0 ? chapter.content.slice(0, introEnd).trim() : '';

    // Group entries by first letter
    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) {
      const letter = entry.term[0].toUpperCase();
      const list = grouped.get(letter) || [];
      list.push(entry);
      grouped.set(letter, list);
    }

    return (
      <motion.article
        key={chapter.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto px-6 md:px-10 py-12 md:py-16"
      >
        <header className="mb-10 md:mb-14">
          <p className="text-amber-600 text-xs tracking-[0.2em] uppercase font-medium mb-3">
            {chapter.partTitle}
          </p>
          <h1 className={`font-serif tracking-tight mb-3 ${darkMode ? 'text-stone-100' : 'text-indigo-950'} text-2xl md:text-3xl`}>
            {chapter.title}
          </h1>
          <p className={`text-sm mt-2 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
            {entries.length} Begriffe – Definition und Vorkommen in den Kapiteln.
          </p>
          <div className="mt-6 h-px bg-gradient-to-r from-amber-500/60 via-amber-500/20 to-transparent" />
        </header>

        <div className={`${fontClass} ${fontSizeClasses[fontSize]} ${darkMode ? 'text-stone-300' : 'text-stone-700'}`} style={fontStyle}>
          {/* Letter navigation */}
          <div className="flex flex-wrap gap-1.5 mb-10 sticky top-16 z-10 py-2 -mx-2 px-2 rounded-lg backdrop-blur-sm"
               style={{ background: darkMode ? 'rgba(28,25,23,0.85)' : 'rgba(250,250,249,0.85)' }}>
            {Array.from(grouped.keys()).map(letter => (
              <button
                key={letter}
                onClick={() => {
                  document.getElementById(`glossar-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  darkMode ? 'bg-stone-800 text-stone-300 hover:bg-stone-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>

          {Array.from(grouped.entries()).map(([letter, items]) => (
            <section key={letter} id={`glossar-${letter}`} className="mb-10 scroll-mt-24">
              <h2 className={`text-lg font-semibold mb-4 pb-1 border-b ${
                darkMode ? 'text-amber-400 border-stone-800' : 'text-indigo-900 border-stone-200'
              }`}>
                {letter}
              </h2>
              <dl className="space-y-6">
                {items.map((entry, i) => {
                  const chapters = keywordIndex.get(entry.term) || [];
                  return (
                    <div key={`${letter}-${i}`} className={`pb-5 border-b ${darkMode ? 'border-stone-800/60' : 'border-stone-200/70'}`}>
                      <dt className={`font-semibold mb-1.5 ${darkMode ? 'text-amber-400' : 'text-indigo-900'}`}>
                        {entry.term}
                      </dt>
                      <dd className={`ml-0 leading-relaxed ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                        {entry.definition}
                      </dd>
                      {chapters.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          <span className={`text-[10px] uppercase tracking-wider mr-1 self-center ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                            Vorkommen:
                          </span>
                          {chapters.slice(0, 6).map(chId => {
                            const ch = ebook?.chapters.find(c => c.id === chId);
                            return ch ? (
                              <button
                                key={chId}
                                onClick={() => navigateTo(chId)}
                                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                                  darkMode ? 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-amber-400' : 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-indigo-700'
                                }`}
                                title={ch.title}
                              >
                                {ch.title.length > 28 ? ch.title.slice(0, 28) + '…' : ch.title}
                              </button>
                            ) : null;
                          })}
                          {chapters.length > 6 && (
                            <span className={`text-[10px] px-2 py-0.5 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                              +{chapters.length - 6} weitere
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>

        <div className="mt-14 flex justify-center">
          <span className="text-amber-500/40 text-2xl select-none">&loz;</span>
        </div>
      </motion.article>
    );
  };

  const renderLiteraturContent = (chapter: Chapter) => {
    // Parse bibliography: detect sub-sections and individual entries
    const paragraphs = chapter.content.split('\n\n').filter(p => p.trim());

    return (
      <motion.article
        key={chapter.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto px-6 md:px-10 py-12 md:py-16"
      >
        <header className="mb-10 md:mb-14">
          <p className="text-amber-600 text-xs tracking-[0.2em] uppercase font-medium mb-3">
            {chapter.partTitle}
          </p>
          <h1 className={`font-serif tracking-tight mb-3 ${darkMode ? 'text-stone-100' : 'text-indigo-950'} text-2xl md:text-3xl`}>
            {chapter.title}
          </h1>
          <div className="mt-6 h-px bg-gradient-to-r from-amber-500/60 via-amber-500/20 to-transparent" />
        </header>

        <div className={`${fontClass} ${fontSizeClasses[fontSize]} ${darkMode ? 'text-stone-300' : 'text-stone-700'}`} style={fontStyle}>
          {paragraphs.map((para, i) => {
            const trimmed = para.trim();

            // Section headings (Primärliteratur, Sekundärliteratur)
            if (/^(Primärliteratur|Sekundärliteratur)/.test(trimmed)) {
              return (
                <h3 key={i} className={`font-serif font-semibold text-lg mt-10 mb-5 pb-2 border-b ${darkMode ? 'text-stone-200 border-stone-700' : 'text-indigo-900 border-stone-300'}`}>
                  {trimmed}
                </h3>
              );
            }

            // Bibliography entries — author name followed by colon
            if (/^[A-ZÄÖÜ][\wäöüÄÖÜß\-]+,\s/.test(trimmed)) {
              const colonIdx = trimmed.indexOf(':');
              if (colonIdx > 0) {
                const author = trimmed.slice(0, colonIdx);
                const rest = trimmed.slice(colonIdx + 1).trim();
                return (
                  <p key={i} className={`pl-6 -indent-6 mb-3 leading-relaxed ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                    <span className={`font-medium ${darkMode ? 'text-stone-200' : 'text-stone-800'}`}>{author}:</span>{' '}
                    <span className="italic">{rest}</span>
                  </p>
                );
              }
            }

            return <p key={i} className="mb-3">{trimmed}</p>;
          })}
        </div>

        <div className="mt-14 flex justify-center">
          <span className="text-amber-500/40 text-2xl select-none">&loz;</span>
        </div>
      </motion.article>
    );
  };


  const renderChapterContent = (chapter: Chapter) => {
    // Use specialized renderers for Glossar and Literaturverzeichnis
    if (chapter.id === 'glossar') return renderGlossarContent(chapter);
    if (chapter.id === 'literatur') return renderLiteraturContent(chapter);

    // Determine displayed content (translated if language ≠ 'de' and cached)
    const cacheKey = `${chapter.id}::${language}`;
    const translated = language !== 'de' ? translationCache.current.get(cacheKey) : undefined;
    const displayContent = translated || chapter.content;
    const isTranslated = !!translated && language !== 'de';
    void translationTick; // subscribe to cache updates

    // Reading time estimate (avg. 200 wpm)
    const wordCount = displayContent.split(/\s+/).filter(Boolean).length;
    const readingMins = Math.max(1, Math.round(wordCount / 200));

    // Split content into paragraphs and render with proper typography
    const paragraphs = displayContent.split('\n\n').filter(p => p.trim());

    return (
      <motion.article
        key={chapter.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto px-6 md:px-10 py-12 md:py-16 relative"
      >
        {/* Dezentes, dynamisches Wasserzeichen (diagonale Kachelung) */}
        <div
          aria-hidden
          className="pointer-events-none select-none absolute inset-0 z-0"
          style={watermarkStyle}
        />
        <div className="relative z-10">
        {/* Chapter header */}
        <header className="mb-10 md:mb-14">
          <p className="text-amber-600 text-xs tracking-[0.2em] uppercase font-medium mb-3">
            {chapter.partTitle}
          </p>
          <h1 className={`font-serif tracking-tight mb-3 ${darkMode ? 'text-stone-100' : 'text-indigo-950'} text-2xl md:text-3xl`}>
            {chapter.title}
          </h1>
          {chapter.subtitle && (
            <p className={`font-serif italic text-base ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
              {chapter.subtitle}
            </p>
          )}
          {isTranslated && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] tracking-wider uppercase px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Sparkles size={10} />
              AI-übersetzt · {languageLabel}
            </div>
          )}
          {translating && language !== 'de' && !isTranslated && (
            <div className={`mt-3 inline-flex items-center gap-2 text-xs ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
              <Loader2 size={12} className="animate-spin text-amber-500" />
              Übersetze nach {languageLabel}…
            </div>
          )}
          {translationError && language !== 'de' && (
            <p className="mt-3 text-xs text-red-500">{translationError} Zeige Originaltext.</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-gradient-to-r from-amber-500/60 via-amber-500/20 to-transparent" />
            <span className={`text-[10px] font-mono tracking-widest uppercase flex-shrink-0 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
              ca. {readingMins} Min. · Nimm dir Zeit.
            </span>
          </div>
        </header>

        {/* Content */}
        <div className={`${fontClass} space-y-5 ${fontSizeClasses[fontSize]} ${darkMode ? 'text-stone-300' : 'text-stone-700'}`} style={fontStyle}>
          {(() => {
            // Globaler Wort-Zähler für Audio-Wort-Spans (läuft über alle Paragraphen)
            let wordOffset = 0;
            const useWordSpans = audio.hasTimestamps && !isTranslated;

            return paragraphs.map((para, i) => {
              const trimmed = para.trim();
              const isActive = audioActiveParagraph === i;
              // Paragraphen-Highlight wenn Audio diesen Abschnitt liest
              const hlClass = isActive
                ? darkMode
                  ? 'bg-amber-500/15 -mx-2 px-2 rounded-sm transition-colors duration-300'
                  : 'bg-amber-100 -mx-2 px-2 rounded-sm transition-colors duration-300'
                : 'transition-colors duration-300';

              // Inhalt rendern: mit Wort-Spans (Audio) oder Keyword-Highlighting (normal)
              const renderContent = (text: string) => {
                if (useWordSpans) {
                  const { nodes, wordCount } = renderWithWordSpans(text, wordOffset);
                  wordOffset += wordCount;
                  return nodes;
                }
                return isTranslated ? text : renderWithKeywords(text, chapter.id);
              };

              // Detect quotes (lines starting with „ or " or «)
              if (trimmed.startsWith('\u201E') || trimmed.startsWith('"') || trimmed.startsWith('\u00AB')) {
                return (
                  <blockquote
                    key={i}
                    data-audio-para={i}
                    className={`border-l-2 border-amber-500/40 pl-5 italic my-8 md:my-10 ${darkMode ? 'text-stone-400' : 'text-stone-500'} ${hlClass}`}
                  >
                    {renderContent(trimmed)}
                  </blockquote>
                );
              }

              // Detect markdown headings (### and ####)
              if (trimmed.startsWith('#### ')) {
                return (
                  <h4 key={i} data-audio-para={i} className={`font-serif font-semibold text-base mt-6 mb-3 ${darkMode ? 'text-stone-300' : 'text-indigo-800'}`}>
                    {trimmed.slice(5)}
                  </h4>
                );
              }
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={i} data-audio-para={i} className={`font-serif font-semibold text-lg mt-8 mb-4 ${darkMode ? 'text-stone-200' : 'text-indigo-900'}`}>
                    {trimmed.slice(4)}
                  </h3>
                );
              }

              // Detect section subheadings (short lines, no period at end, <80 chars)
              if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.endsWith(':') && !trimmed.endsWith(',') && !trimmed.includes('\n') && /^[A-ZÄÖÜ\d]/.test(trimmed)) {
                return (
                  <h3 key={i} data-audio-para={i} className={`font-serif font-semibold text-lg mt-8 mb-4 ${darkMode ? 'text-stone-200' : 'text-indigo-900'}`}>
                    {trimmed}
                  </h3>
                );
              }

              return (
                <p key={i} data-audio-para={i} className={hlClass}>
                  {renderContent(trimmed)}
                </p>
              );
            });
          })()}
        </div>

        {/* Chapter ornament */}
        <div className="mt-14 flex justify-center">
          <span className="text-amber-500/40 text-2xl select-none">&loz;</span>
        </div>

        {/* ── Completion toggle at end of chapter ── */}
        <div className="mt-8 mb-2 flex justify-center">
          <button
            onClick={() => toggleCompleted(chapter.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-mono tracking-widest uppercase transition-all duration-200 ${
              completedChapters.includes(chapter.id)
                ? 'border-emerald-500/60 text-emerald-500 bg-emerald-500/8'
                : darkMode
                  ? 'border-stone-700 text-stone-500 hover:border-stone-500 hover:text-stone-300'
                  : 'border-stone-300 text-stone-400 hover:border-stone-400 hover:text-stone-600'
            }`}
            title={completedChapters.includes(chapter.id) ? 'Als ungelesen markieren' : 'Als gelesen markieren'}
          >
            <CheckCircle2 size={13} />
            {completedChapters.includes(chapter.id) ? 'Gelesen' : 'Als gelesen markieren'}
          </button>
        </div>
        </div>
      </motion.article>
    );
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + query.length + 60);
    const snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
    return snippet;
  };

  return (
    <div className={`h-dvh flex flex-col ${darkMode ? 'bg-stone-950 text-stone-200' : 'bg-stone-50 text-stone-800'}`}>
      {/* ─── Service-Worker-Update-Toast ──────────────────────── */}
      <AnimatePresence>
        {swNeedsRefresh && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-3 right-3 z-[60] max-w-sm rounded-lg shadow-lg border border-amber-500/40 bg-indigo-950 text-stone-100 px-4 py-3 flex items-center gap-3"
          >
            <Sparkles size={16} className="text-amber-400 flex-none" />
            <div className="text-xs leading-tight flex-1">
              Neue Version verfügbar.
            </div>
            <button
              onClick={() => { swUpdateRef.current?.().catch(() => {}); setSwNeedsRefresh(false); }}
              className="text-xs font-medium px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white transition-colors"
            >
              Neu laden
            </button>
            <button
              onClick={() => setSwNeedsRefresh(false)}
              className="p-1 text-stone-400 hover:text-stone-100 transition-colors"
              title="Später"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Buch-Schwellen-Overlay ──────────────────────────── */}
      {/* Das Dazwischen zwischen zwei Bänden — die Schwelle als sichtbarer Moment */}
      <AnimatePresence>
        {buchSchwelle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="fixed inset-0 z-[80] flex items-center justify-center"
            style={{ background: darkMode ? '#080806' : '#f8f3ea' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="text-center px-8 max-w-lg"
            >
              <p className={`text-xs tracking-[0.45em] uppercase font-mono mb-7 ${darkMode ? 'text-amber-600/50' : 'text-amber-700/60'}`}>
                Band {buchSchwelle.romanNum}
              </p>
              <div className="w-20 h-px mx-auto mb-9"
                   style={{ background: darkMode
                     ? 'linear-gradient(to right, transparent, rgba(217,119,6,0.4), transparent)'
                     : 'linear-gradient(to right, transparent, rgba(180,83,9,0.35), transparent)' }} />
              <h2 className={`font-serif text-3xl md:text-4xl tracking-tight leading-tight mb-5 ${darkMode ? 'text-stone-100/90' : 'text-stone-800'}`}>
                {buchSchwelle.title}
              </h2>
              {buchSchwelle.subtitle && (
                <p className={`font-serif italic text-lg leading-relaxed ${darkMode ? 'text-stone-400/70' : 'text-stone-500'}`}>
                  {buchSchwelle.subtitle}
                </p>
              )}
              <div className="mt-12 flex items-center justify-center gap-3">
                <div className="w-12 h-px" style={{ background: darkMode ? 'rgba(217,119,6,0.2)' : 'rgba(180,83,9,0.18)' }} />
                <span className={`text-[10px] font-mono tracking-[0.4em] uppercase ${darkMode ? 'text-stone-700' : 'text-stone-400'}`}>Schwelle</span>
                <div className="w-12 h-px" style={{ background: darkMode ? 'rgba(217,119,6,0.2)' : 'rgba(180,83,9,0.18)' }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Print/PDF-Schutz: Screen-Overlay während Druck ──── */}
      {printBlocked && (
        <div className="fixed inset-0 z-[100] bg-white text-stone-900 flex items-center justify-center p-8 print:flex">
          <div className="max-w-md text-center font-serif">
            <p className="text-lg mb-2">Drucken &amp; PDF-Export sind für dieses Werk nicht verfügbar.</p>
            <p className="text-sm text-stone-600">Bitte nutzen Sie die digitale Ausgabe.</p>
          </div>
        </div>
      )}

      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <header className={`flex-none h-12 flex items-center px-4 gap-2 border-b z-40 relative ${darkMode ? 'bg-stone-900/95 border-stone-800' : 'bg-white/95 border-stone-200'} backdrop-blur-sm`}>
        {/* Burger menu with actions */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setBurgerMenuOpen(o => !o); }}
            className={`p-1.5 rounded-md transition-colors ${burgerMenuOpen ? (darkMode ? 'bg-stone-700' : 'bg-stone-200') : (darkMode ? 'hover:bg-stone-700/50' : 'hover:bg-stone-200/50')}`}
            title="Menü"
          >
            <Menu size={18} />
          </button>
          <AnimatePresence>
            {burgerMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                className={`absolute left-0 top-full mt-2 w-56 rounded-xl shadow-xl border z-50 overflow-hidden ${darkMode ? 'bg-stone-800 border-stone-700' : 'bg-white border-stone-200'}`}
              >
                <div className="py-1">
                  <button
                    onClick={() => { navigateTo('vorwort'); setBurgerMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${darkMode ? 'text-stone-200 hover:bg-stone-700' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    <BookOpen size={16} className="text-amber-500 flex-none" />
                    Beginnen zu Lesen
                  </button>
                  {!isInstalled && (
                    <button
                      onClick={async () => {
                        setBurgerMenuOpen(false);
                        if (installPrompt && 'prompt' in installPrompt) {
                          (installPrompt as any).prompt();
                          const result = await (installPrompt as any).userChoice;
                          if (result.outcome === 'accepted') setIsInstalled(true);
                          setInstallPrompt(null);
                        } else {
                          alert('Tippe auf \u201eTeilen\u201c \u27a1 \u201eZum Home-Bildschirm\u201c um die App zu installieren.');
                        }
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${darkMode ? 'text-stone-200 hover:bg-stone-700' : 'text-stone-700 hover:bg-stone-100'}`}
                    >
                      <Smartphone size={16} className="text-amber-500 flex-none" />
                      App installieren
                    </button>
                  )}
                  <a
                    href={`/api/pdf?wm=${encodeURIComponent(watermarkId)}`}
                    onClick={() => setBurgerMenuOpen(false)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${darkMode ? 'text-stone-200 hover:bg-stone-700' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    <Download size={16} className="text-amber-500 flex-none" />
                    PDF herunterladen
                  </a>
                  <div className={`h-px mx-4 my-1 ${darkMode ? 'bg-stone-700' : 'bg-stone-200'}`} />
                  <button
                    onClick={() => { setEnkiduOpen(true); setBurgerMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${darkMode ? 'text-stone-200 hover:bg-stone-700' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    <Sparkles size={16} className="text-amber-500 flex-none" />
                    Enkidu — Begegnung
                  </button>
                  <button
                    onClick={() => { setConceptGraphOpen(true); setBurgerMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${darkMode ? 'text-stone-200 hover:bg-stone-700' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    <Network size={16} className="text-amber-500 flex-none" />
                    Begriffsnetz
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar toggle (claude.ai-style panel icon) */}
        {!focusMode && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1.5 rounded-md transition-colors ${darkMode ? 'hover:bg-stone-700/50' : 'hover:bg-stone-200/50'}`}
            title={sidebarOpen ? 'Navigation einklappen' : 'Navigation ausklappen'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        )}

        {/* Tiefenlese-Modus */}
        <button
          onClick={() => { setFocusMode(v => !v); if (!focusMode) setSidebarOpen(false); }}
          className={`p-1.5 rounded-md transition-colors ${focusMode ? (darkMode ? 'bg-amber-600/20 text-amber-400' : 'bg-amber-100 text-amber-700') : (darkMode ? 'hover:bg-stone-700/50' : 'hover:bg-stone-200/50')}`}
          title={focusMode ? 'Tiefenlesen beenden (F)' : 'Tiefenlesen — volle Konzentration (F)'}
        >
          {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-serif truncate opacity-70">
            {currentId === '__cover__' ? ebook.meta.title : currentChapter?.partTitle}
          </h1>
        </div>

        {/* Progress bar — overall book position */}
        {currentId !== '__cover__' && (
          <div className={`hidden sm:block w-24 h-1 rounded-full overflow-hidden ${darkMode ? 'bg-stone-800' : 'bg-stone-200'}`}
               title={`Kapitel ${currentIndex} von ${allIds.length - 1}`}>
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((currentIndex / (allIds.length - 1)) * 100)}%` }}
            />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button onClick={() => setSearchOpen(!searchOpen)} className="p-1.5 rounded-md hover:bg-stone-200/50 transition-colors" title="Suche (Ctrl+F)">
            <Search size={16} />
          </button>

          {/* Headphones — Audio-Player (vorproduzierte MP3) */}
          {currentId !== '__cover__' && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (audio.hasAudio) {
                    // Klick auf Icon startet/pausiert direkt
                    if (!headphonesMenuOpen) audio.toggle();
                  }
                  setHeadphonesMenuOpen(o => !o);
                  setFontMenuOpen(false);
                  setLanguageMenuOpen(false);
                }}
                className={`p-1.5 rounded-md transition-colors ${
                  isPlaying
                    ? 'text-amber-500 bg-amber-500/10'
                    : headphonesMenuOpen
                      ? (darkMode ? 'bg-stone-700 text-amber-400' : 'bg-stone-200 text-amber-600')
                      : audio.hasAudio
                        ? 'hover:bg-stone-200/50'
                        : 'opacity-30 cursor-not-allowed'
                }`}
                title={
                  audio.loading ? 'Lädt Audio…'
                  : !audio.hasAudio ? 'Kein Audio für dieses Kapitel'
                  : isPlaying ? 'Pause'
                  : 'Kapitel anhören'
                }
                disabled={audio.loading}
              >
                <Headphones size={16} className={isPlaying ? 'animate-pulse' : ''} />
              </button>

              <AnimatePresence>
                {headphonesMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute right-0 top-full mt-2 w-60 rounded-xl shadow-xl border z-40 overflow-hidden ${darkMode ? 'bg-stone-800 border-stone-700' : 'bg-white border-stone-200'}`}
                  >
                    {!audio.hasAudio ? (
                      <div className={`px-4 py-4 text-center text-xs ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                        {audio.loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 size={12} className="animate-spin text-amber-500" />
                            Lädt…
                          </span>
                        ) : (
                          <span>Noch kein Audio für dieses Kapitel verfügbar.</span>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Play / Pause */}
                        <div className={`px-3 pt-3 pb-2.5 border-b ${darkMode ? 'border-stone-700' : 'border-stone-100'}`}>
                          <button
                            onClick={() => audio.toggle()}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              isPlaying
                                ? darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-700'
                                : darkMode ? 'bg-stone-700 text-stone-200 hover:bg-stone-600' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                            }`}
                          >
                            {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            {isPlaying ? 'Pause' : 'Kapitel anhören'}
                          </button>
                        </div>

                        {/* Seekbar + Zeitanzeige */}
                        <div className={`px-3 pt-2.5 pb-2.5 border-b ${darkMode ? 'border-stone-700' : 'border-stone-100'}`}>
                          <div
                            className={`w-full h-1.5 rounded-full cursor-pointer ${darkMode ? 'bg-stone-700' : 'bg-stone-200'}`}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const fraction = (e.clientX - rect.left) / rect.width;
                              audio.seekFraction(Math.max(0, Math.min(1, fraction)));
                            }}
                          >
                            <div
                              className="h-full bg-amber-500 rounded-full transition-none"
                              style={{ width: `${audio.progress}%` }}
                            />
                          </div>
                          <div className={`flex justify-between text-[9px] mt-1 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                            <span>{formatTime(audio.currentTime)}</span>
                            <span>{formatTime(audio.duration)}</span>
                          </div>
                        </div>

                        {/* Stimme: männlich / weiblich */}
                        <div className="px-3 pt-2.5 pb-3">
                          <p className={`text-[10px] uppercase tracking-wider mb-1.5 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Stimme</p>
                          <div className="flex gap-1.5">
                            {(['female', 'male'] as VoiceGender[]).map(v => (
                              <button
                                key={v}
                                onClick={() => {
                                  const wasPlaying = isPlaying;
                                  if (wasPlaying) audio.pause();
                                  setAudioVoice(v);
                                  audio.setVoice(v);
                                }}
                                className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors border ${
                                  audioVoice === v
                                    ? darkMode ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300'
                                    : darkMode ? 'text-stone-400 border-stone-700 hover:text-stone-200' : 'text-stone-500 border-stone-200 hover:text-stone-700'
                                }`}
                              >
                                {v === 'female' ? '♀ Weiblich' : '♂ Männlich'}
                              </button>
                            ))}
                          </div>
                          {audio.hasTimestamps && (
                            <p className={`text-[9px] mt-1.5 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                              ✦ Wort-Highlighting aktiv
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Concept Graph */}
          <button
            onClick={() => setConceptGraphOpen(true)}
            className={`p-1.5 rounded-md transition-colors hidden sm:flex ${conceptGraphOpen ? 'text-amber-500' : 'hover:bg-stone-200/50'}`}
            title="Begriffsnetz"
          >
            <Network size={16} />
          </button>

          {/* Bookmark */}
          {currentId !== '__cover__' && (
            <button
              onClick={() => toggleBookmark(currentId)}
              className={`p-1.5 rounded-md transition-colors ${bookmarks.includes(currentId) ? 'text-amber-500' : 'hover:bg-stone-200/50'}`}
              title="Lesezeichen"
            >
              <Bookmark size={16} fill={bookmarks.includes(currentId) ? 'currentColor' : 'none'} />
            </button>
          )}

          {/* Chapter notes */}
          {currentId !== '__cover__' && (
            <button
              onClick={() => setNotesOpen(o => !o)}
              className={`p-1.5 rounded-md transition-colors relative ${notesOpen ? 'text-amber-500' : 'hover:bg-stone-200/50'}`}
              title="Kapitelnotizen"
            >
              <PenLine size={16} />
              {notes[currentId] && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </button>
          )}

          {/* Personalisierung — Darstellung, Sprache, Schrift */}
          <button
            onClick={() => setPersonalizationOpen(o => !o)}
            className={`p-1.5 rounded-md transition-colors ${personalizationOpen ? (darkMode ? 'bg-amber-600/20 text-amber-400' : 'bg-amber-100 text-amber-700') : (darkMode ? 'hover:bg-stone-700/50' : 'hover:bg-stone-200/50')}`}
            title="Darstellung anpassen"
          >
            <SlidersHorizontal size={16} />
          </button>

          {/* Keyboard shortcuts help */}
          <button
            onClick={() => setShortcutsOpen(o => !o)}
            className={`p-1.5 rounded-md transition-colors font-mono text-xs ${shortcutsOpen ? 'text-amber-500' : (darkMode ? 'opacity-40 hover:opacity-80' : 'opacity-30 hover:opacity-70')}`}
            title="Tastenkürzel anzeigen (?)"
          >?</button>
        </div>
      </header>

      {/* ─── Keyboard shortcuts panel ────────────────────────── */}
      <AnimatePresence>
        {shortcutsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShortcutsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={e => e.stopPropagation()}
              className={`rounded-lg border shadow-2xl p-6 w-full max-w-sm ${darkMode ? 'bg-stone-900 border-stone-700' : 'bg-white border-stone-200'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-mono text-xs tracking-widest uppercase ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>Tastenkürzel</h3>
                <button onClick={() => setShortcutsOpen(false)} className={`font-mono text-lg leading-none ${darkMode ? 'text-stone-500 hover:text-stone-200' : 'text-stone-400 hover:text-stone-700'}`}>×</button>
              </div>
              <div className="space-y-1">
                {[
                  { key: '→ / ]',    desc: 'Nächstes Kapitel' },
                  { key: '← / [',    desc: 'Vorheriges Kapitel' },
                  { key: '/ ',       desc: 'Suche öffnen' },
                  { key: 'Ctrl+F',   desc: 'Suche öffnen' },
                  { key: 'b',        desc: 'Lesezeichen setzen' },
                  { key: 'c',        desc: 'Kapitel als gelesen markieren' },
                  { key: 'd',        desc: 'Hell / Dunkel wechseln' },
                  { key: 'f',        desc: 'Tiefenlesen ein-/ausschalten' },
                  { key: 't',        desc: 'Seitenleiste ein-/ausblenden' },
                  { key: 'e',        desc: 'Enkidu öffnen / schließen' },
                  { key: 'n',        desc: 'Begriffsnetz öffnen / schließen' },
                  { key: 'Esc',      desc: 'Aktuelles Panel schließen' },
                  { key: '?',        desc: 'Diese Übersicht' },
                ].map(({ key, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <kbd className={`font-mono text-xs px-1.5 py-0.5 rounded border ${darkMode ? 'bg-stone-800 border-stone-600 text-stone-300' : 'bg-stone-100 border-stone-300 text-stone-600'}`}>
                      {key}
                    </kbd>
                    <span className={`text-xs flex-1 text-right ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{desc}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Chapter Notes Panel ─────────────────────────────── */}
      <AnimatePresence>
        {notesOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`fixed top-0 right-0 h-full w-80 z-[55] flex flex-col shadow-2xl border-l ${
              darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'
            }`}
          >
            {/* Panel header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b flex-none ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
              <div className="flex items-center gap-2">
                <PenLine size={14} className="text-amber-500" />
                <span className={`text-xs font-mono tracking-widest uppercase ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                  Notizen
                </span>
              </div>
              <button
                onClick={() => setNotesOpen(false)}
                className={`p-1 rounded transition-colors ${darkMode ? 'text-stone-500 hover:text-stone-200' : 'text-stone-400 hover:text-stone-700'}`}
              >
                <X size={14} />
              </button>
            </div>

            {/* Chapter label */}
            {ebook && currentId !== '__cover__' && (() => {
              const ch = ebook.chapters.find(c => c.id === currentId);
              return ch ? (
                <div className={`px-4 py-2 border-b flex-none ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                  <p className={`text-[11px] truncate ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>{ch.title}</p>
                </div>
              ) : null;
            })()}

            {/* Textarea */}
            <textarea
              className={`flex-1 resize-none p-4 text-sm leading-relaxed focus:outline-none ${
                darkMode
                  ? 'bg-stone-900 text-stone-200 placeholder:text-stone-700'
                  : 'bg-white text-stone-800 placeholder:text-stone-300'
              }`}
              placeholder="Gedanken und Anmerkungen …"
              value={notes[currentId] ?? ''}
              onChange={e => setNotes(prev => ({ ...prev, [currentId]: e.target.value }))}
            />

            {/* Footer */}
            <div className={`px-4 py-2 border-t flex-none flex items-center justify-between ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
              <span className={`text-[10px] font-mono ${darkMode ? 'text-stone-700' : 'text-stone-300'}`}>
                Automatisch gespeichert
              </span>
              {notes[currentId] && (
                <button
                  onClick={() => setNotes(prev => { const n = { ...prev }; delete n[currentId]; return n; })}
                  className={`text-[10px] font-mono transition-colors ${darkMode ? 'text-stone-600 hover:text-red-400' : 'text-stone-400 hover:text-red-500'}`}
                >
                  Löschen
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Personalisierungs-Panel (rechts) ───────────────── */}
      <AnimatePresence>
        {personalizationOpen && (
          <>
            {/* Backdrop — schließt Panel auf Mobile */}
            <div
              className="fixed inset-0 z-[44] md:hidden"
              onClick={() => setPersonalizationOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className={`fixed right-0 top-12 bottom-0 w-72 z-[45] flex flex-col shadow-2xl border-l ${
                darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'
              }`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b flex-none ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-amber-500" />
                  <span className={`text-xs font-mono tracking-widest uppercase ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                    Darstellung
                  </span>
                </div>
                <button
                  onClick={() => setPersonalizationOpen(false)}
                  className={`p-1 rounded transition-colors ${darkMode ? 'text-stone-500 hover:text-stone-200' : 'text-stone-400 hover:text-stone-700'}`}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Scrollbarer Inhalt */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* ── Hell / Dunkel ── */}
                <section>
                  <p className={`text-[10px] uppercase tracking-widest mb-3 font-mono ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                    Darstellungsmodus
                  </p>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                      darkMode
                        ? 'bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      {darkMode ? <Moon size={14} /> : <Sun size={14} />}
                      {darkMode ? 'Dunkelmodus' : 'Hellmodus'}
                    </span>
                    {/* Toggle-Pill */}
                    <div className={`w-9 h-5 rounded-full relative transition-colors flex-none ${darkMode ? 'bg-amber-500' : 'bg-stone-300'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${darkMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </button>
                </section>

                {/* ── Schriftgröße ── */}
                <section>
                  <p className={`text-[10px] uppercase tracking-widest mb-3 font-mono ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                    Schriftgröße
                  </p>
                  <div className={`flex items-center gap-2 p-1 rounded-xl ${darkMode ? 'bg-stone-800' : 'bg-stone-100'}`}>
                    <button
                      onClick={() => setFontSize(Math.max(0, fontSize - 1))}
                      disabled={fontSize === 0}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 ${
                        darkMode ? 'hover:bg-stone-700 text-stone-300 active:bg-stone-600' : 'hover:bg-white text-stone-600 active:bg-stone-50'
                      }`}
                    >A−</button>
                    <span className={`text-xs font-mono w-16 text-center ${darkMode ? 'text-stone-300' : 'text-stone-600'}`}>
                      {['Klein', 'Normal', 'Groß', 'Sehr groß'][fontSize]}
                    </span>
                    <button
                      onClick={() => setFontSize(Math.min(3, fontSize + 1))}
                      disabled={fontSize === 3}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 ${
                        darkMode ? 'hover:bg-stone-700 text-stone-300 active:bg-stone-600' : 'hover:bg-white text-stone-600 active:bg-stone-50'
                      }`}
                    >A+</button>
                  </div>
                </section>

                {/* ── Schriftart ── */}
                <section>
                  <p className={`text-[10px] uppercase tracking-widest mb-3 font-mono ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                    Schriftart
                  </p>
                  <div className="space-y-1">
                    {fontFamilyOptions.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setFontFamily(opt.key)}
                        style={fontFamilyStyle[opt.key]}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          fontFamily === opt.key
                            ? (darkMode ? 'bg-amber-500/15 text-amber-400 font-medium' : 'bg-amber-500/12 text-amber-700 font-medium')
                            : (darkMode ? 'text-stone-300 hover:bg-stone-800' : 'text-stone-600 hover:bg-stone-50')
                        }`}
                      >
                        {opt.label}
                        {fontFamily === opt.key && (
                          <span className="float-right text-amber-500 text-xs mt-0.5">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>

                {/* ── Sprache ── */}
                <section>
                  <p className={`text-[10px] uppercase tracking-widest mb-3 font-mono ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                    Sprache
                    {translating && <Loader2 size={10} className="inline ml-2 animate-spin text-amber-500" />}
                  </p>
                  <div className="space-y-1">
                    {languageOptions.map(opt => (
                      <button
                        key={opt.code}
                        onClick={() => setLanguage(opt.code)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors ${
                          language === opt.code
                            ? (darkMode ? 'bg-amber-500/15 text-amber-400 font-medium' : 'bg-amber-500/12 text-amber-700 font-medium')
                            : (darkMode ? 'text-stone-300 hover:bg-stone-800' : 'text-stone-600 hover:bg-stone-50')
                        }`}
                      >
                        {opt.label}
                        {language === opt.code && <span className="text-amber-500 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                  <p className={`mt-2 px-1 text-[10px] ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                    Glossar &amp; Literatur bleiben immer Deutsch.
                  </p>
                </section>

              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ─── Search Bar ──────────────────────────────────────── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`flex-none border-b z-20 overflow-hidden ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}`}
          >
            <div className="p-3 max-w-2xl mx-auto">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Im Ebook suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full px-4 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                  darkMode ? 'bg-stone-800 border-stone-700 text-stone-200 placeholder:text-stone-500' : 'bg-stone-50 border-stone-200 text-stone-800 placeholder:text-stone-400'
                }`}
              />
              {searchQuery && (
                <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                  {searchResults.length === 0 ? (
                    <p className="text-xs text-stone-500 px-2 py-1">Keine Ergebnisse</p>
                  ) : (
                    searchResults.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => navigateTo(ch.id)}
                        className={`w-full text-left px-3 py-2 rounded text-xs hover:bg-amber-500/10 transition-colors ${darkMode ? 'hover:text-amber-400' : 'hover:text-amber-700'}`}
                      >
                        <span className="font-medium">{ch.title}</span>
                        <span className={`block mt-0.5 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                          {highlightMatch(ch.content, searchQuery).slice(0, 140)}
                        </span>
                      </button>
                    ))
                  )}
                  <p className="text-xs text-stone-500 px-2">{searchResults.length} Treffer</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Body ───────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Sidebar overlay (mobile only) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ─── Sidebar (push-layout auf Desktop, overlay auf Mobile) ── */}
        <aside
          className={`
            fixed md:relative z-30 top-12 md:top-0 bottom-0 left-0 w-72 flex-none overflow-y-auto
            border-r transition-all duration-300 ease-in-out
            ${focusMode
              ? '-translate-x-full md:translate-x-0 md:w-0 md:min-w-0 md:overflow-hidden md:border-r-0'
              : sidebarOpen ? 'translate-x-0 md:w-72 md:min-w-[18rem]' : '-translate-x-full md:translate-x-0 md:w-0 md:min-w-0 md:overflow-hidden md:border-r-0'}
            ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}
          `}
        >
          <nav className="p-4 space-y-1">
            {/* Progress indicator */}
            {ebook && (() => {
              const eligible = ebook.chapters.filter(c => c.id !== 'glossar' && c.id !== 'literatur');
              const done = eligible.filter(c => completedChapters.includes(c.id)).length;
              const pct = eligible.length > 0 ? Math.round((done / eligible.length) * 100) : 0;
              return (
                <div className="mb-3 px-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-mono tracking-widest uppercase ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                      Fortschritt
                    </span>
                    <span className={`text-[10px] font-mono ${done > 0 ? 'text-emerald-500' : darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                      {done} / {eligible.length}
                    </span>
                  </div>
                  <div className={`h-0.5 rounded-full ${darkMode ? 'bg-stone-800' : 'bg-stone-200'}`}>
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Cover */}
            <button
              onClick={() => navigateTo('__cover__')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                currentId === '__cover__'
                  ? 'bg-amber-500/15 text-amber-700 font-medium'
                  : darkMode ? 'text-stone-400 hover:bg-stone-800 hover:text-stone-200' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <BookOpen size={14} className="inline mr-2 opacity-60" />
              Cover
            </button>

            {/* Parts & Chapters */}
            {ebook.parts.map(part => {
              const partChapters = ebook.chapters.filter(c => c.part === part.id);
              if (partChapters.length === 0) return null;
              const isExpanded = expandedParts.has(part.id);
              const togglePart = () =>
                setExpandedParts(prev => {
                  const next = new Set(prev);
                  if (next.has(part.id)) next.delete(part.id);
                  else next.add(part.id);
                  return next;
                });

              return (
                <div key={part.id} className="pt-3">
                  <button
                    type="button"
                    onClick={togglePart}
                    aria-expanded={isExpanded}
                    className={`w-full flex items-center gap-1.5 px-3 py-1 rounded-md text-left transition-colors ${
                      darkMode ? 'hover:bg-stone-800/60' : 'hover:bg-stone-100'
                    }`}
                  >
                    <ChevronRight
                      size={11}
                      className={`flex-none transition-transform ${isExpanded ? 'rotate-90' : ''} ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}
                    />
                    <span className={`flex-1 min-w-0 text-[10px] tracking-[0.15em] uppercase font-semibold ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                      {part.title}
                    </span>
                  </button>
                  {isExpanded && part.subtitle && (
                    <p className={`px-3 text-[10px] italic mb-2 mt-1 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                      {part.subtitle}
                    </p>
                  )}
                  {isExpanded && partChapters.map(ch => (
                    <div key={ch.id} className="flex items-center group">
                      <button
                        onClick={() => navigateTo(ch.id)}
                        className={`flex-1 min-w-0 text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                          currentId === ch.id
                            ? 'bg-amber-500/15 text-amber-700 font-medium'
                            : darkMode ? 'text-stone-400 hover:bg-stone-800 hover:text-stone-200' : 'text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        {bookmarks.includes(ch.id) && <Bookmark size={10} className="text-amber-500 flex-none" fill="currentColor" />}
                        <span className="truncate">{ch.title}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCompleted(ch.id); }}
                        title={completedChapters.includes(ch.id) ? 'Als ungelesen markieren' : 'Als gelesen markieren'}
                        className={`flex-none p-1 mr-1 rounded transition-colors ${
                          completedChapters.includes(ch.id)
                            ? 'text-emerald-500 opacity-80 hover:opacity-100'
                            : darkMode
                              ? 'text-stone-700 opacity-0 group-hover:opacity-100 hover:text-stone-400'
                              : 'text-stone-300 opacity-0 group-hover:opacity-100 hover:text-stone-500'
                        }`}
                      >
                        <CheckCircle2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Bookmarks section */}
            {bookmarks.length > 0 && (
              <div className="pt-4 border-t border-stone-200 dark:border-stone-800 mt-4">
                <p className={`px-3 text-[10px] tracking-[0.15em] uppercase font-semibold mb-1 ${darkMode ? 'text-amber-500/60' : 'text-amber-600/60'}`}>
                  Lesezeichen
                </p>
                {bookmarks.map(id => {
                  const ch = ebook.chapters.find(c => c.id === id);
                  if (!ch) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => navigateTo(id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        darkMode ? 'text-stone-400 hover:bg-stone-800' : 'text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      <Bookmark size={10} className="inline mr-1.5 text-amber-500" fill="currentColor" />
                      {ch.title}
                    </button>
                  );
                })}
              </div>
            )}

            {/* PDF download (now also available in burger menu) */}
            <div className="pt-4 border-t border-stone-200 dark:border-stone-800 mt-4">
              <a
                href={`/api/pdf?wm=${encodeURIComponent(watermarkId)}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-600 hover:bg-amber-500/10 transition-colors"
              >
                <Download size={14} />
                PDF herunterladen
              </a>
            </div>
            {/* Sidebar close button (mobile) */}
            <div className="pt-2 md:hidden">
              <button
                onClick={() => setSidebarOpen(false)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${darkMode ? 'text-stone-500 hover:bg-stone-800' : 'text-stone-400 hover:bg-stone-100'}`}
              >
                <PanelLeftClose size={14} />
                Navigation schlie\u00dfen
              </button>
            </div>
          </nav>
        </aside>

        {/* ─── Content + sticky player column ───────────────── */}
        <div className="flex-1 flex flex-col min-h-0">
        <main
          ref={contentRef}
          data-content-protected
          className={`flex-1 overflow-y-auto relative transition-all duration-500 ${focusMode ? 'bg-opacity-100' : ''}`}
          style={focusMode ? { lineHeight: '1.95', letterSpacing: '0.01em' } : undefined}
          onClick={() => { setActiveKeyword(null); setFontMenuOpen(false); setLanguageMenuOpen(false); setHeadphonesMenuOpen(false); setBurgerMenuOpen(false); }}
        >
          {currentId === '__cover__'
            ? renderCover()
            : currentChapter?.isTitlePage
              ? renderBandTitlePage(currentChapter)
              : currentChapter && renderChapterContent(currentChapter)}

          {/* Keyword popover */}
          <AnimatePresence>
            {activeKeyword && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className={`fixed z-50 max-w-sm rounded-xl shadow-xl border p-4 ${
                  darkMode ? 'bg-stone-800 border-stone-700' : 'bg-white border-stone-200'
                }`}
                style={{
                  left: Math.min(activeKeyword.x, window.innerWidth - 380),
                  top: Math.min(activeKeyword.y, window.innerHeight - 200),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h4 className={`font-serif font-semibold text-sm mb-2 ${darkMode ? 'text-amber-400' : 'text-indigo-900'}`}>
                  {activeKeyword.term}
                </h4>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                  {activeKeyword.definition}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => { navigateTo('glossar'); setActiveKeyword(null); }}
                    className="text-[10px] text-amber-600 hover:text-amber-500 transition-colors"
                  >
                    Im Glossar ansehen →
                  </button>
                  <button
                    onClick={() => setActiveKeyword(null)}
                    className={`text-[10px] ml-auto ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}
                  >
                    Schließen
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll to top */}
          <AnimatePresence>
            {showScrollTop && !chatOpen && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                className={`fixed right-6 p-3 rounded-full shadow-lg z-10 transition-colors ${
                  darkMode ? 'bg-stone-800 text-stone-300 hover:bg-stone-700' : 'bg-white text-stone-600 hover:bg-stone-50 border border-stone-200'
                }`}
              >
                <ChevronUp size={18} />
              </motion.button>
            )}
          </AnimatePresence>

          {/* ─── Q&A Chat ──────────────────────────────────────── */}
          {currentId !== '__cover__' && (
            <>
              {/* FAB button */}
              <AnimatePresence>
                {!chatOpen && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => setChatOpen(true)}
                    style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                    className={`fixed right-6 p-3.5 rounded-full shadow-lg z-20 transition-colors ${
                      darkMode
                        ? 'bg-amber-600 text-white hover:bg-amber-500'
                        : 'bg-indigo-900 text-white hover:bg-indigo-800'
                    }`}
                    title="Dem Autor eine Frage stellen"
                  >
                    <MessageCircleQuestion size={20} />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Chat panel */}
              <AnimatePresence>
                {chatOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
                    className={`fixed right-4 w-[360px] max-h-[500px] z-40 rounded-2xl shadow-2xl border flex flex-col overflow-hidden ${
                      darkMode ? 'bg-stone-900 border-stone-700' : 'bg-white border-stone-200'
                    }`}
                  >
                    {/* Chat header */}
                    <div className={`flex items-center justify-between px-4 py-3 border-b flex-none ${
                      darkMode ? 'border-stone-700 bg-stone-800/50' : 'border-stone-100 bg-stone-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <MessageCircleQuestion size={16} className="text-amber-500" />
                        <span className="font-serif text-sm font-medium">Frage zum Kapitel</span>
                      </div>
                      <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-stone-200/50 transition-colors">
                        <X size={14} />
                      </button>
                    </div>

                    {/* Chat context */}
                    <div className={`px-4 py-2 text-[10px] border-b flex-none ${
                      darkMode ? 'border-stone-700 text-stone-500' : 'border-stone-100 text-stone-400'
                    }`}>
                      Kontext: {currentChapter?.title || currentId}
                    </div>

                    {/* Chat messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-[200px]">
                      {chatHistory.length === 0 && (
                        <div className={`text-center py-8 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                          <MessageCircleQuestion size={32} className="mx-auto mb-3 opacity-40" />
                          <p className="text-xs">Stelle eine Frage zum aktuellen Kapitel.</p>
                          <p className="text-[10px] mt-1 opacity-60">Die Antwort bezieht sich auf den Inhalt und das Gesamtwerk.</p>
                        </div>
                      )}
                      {chatHistory.map((entry, i) => (
                        <div key={i} className="space-y-2">
                          {/* Question */}
                          <div className="flex justify-end">
                            <div className={`max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2 text-xs ${
                              darkMode ? 'bg-amber-600/20 text-amber-200' : 'bg-indigo-900 text-white'
                            }`}>
                              {entry.q}
                            </div>
                          </div>
                          {/* Answer */}
                          {entry.a ? (
                            <div className="flex justify-start items-end gap-1">
                              <div className={`max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2 text-xs leading-relaxed ${
                                darkMode ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700'
                              }`}>
                                {entry.a.split('\n\n').map((p, j) => (
                                  <p key={j} className={j > 0 ? 'mt-2' : ''}>{p}</p>
                                ))}
                              </div>
                              {/* Antwort-Vorlesen via Web Speech API (Chat-only, kein MP3 nötig) */}
                            </div>
                          ) : (
                            <div className="flex justify-start">
                              <div className={`rounded-2xl rounded-tl-sm px-3.5 py-2 ${
                                darkMode ? 'bg-stone-800' : 'bg-stone-100'
                              }`}>
                                <Loader2 size={14} className="animate-spin text-amber-500" />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat input */}
                    <div className={`px-3 py-3 border-t flex-none flex gap-2 ${
                      darkMode ? 'border-stone-700' : 'border-stone-100'
                    }`}>
                      {/* Mic button */}
                      {chatStt.supported && (
                        <button
                          onClick={chatStt.toggle}
                          className={`p-2 rounded-lg transition-colors flex-none ${
                            chatStt.listening
                              ? 'bg-red-500 text-white animate-pulse'
                              : darkMode ? 'bg-stone-700 text-stone-300 hover:bg-stone-600' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                          title={chatStt.listening ? 'Aufnahme stoppen' : 'Frage sprechen'}
                        >
                          {chatStt.listening ? <MicOff size={14} /> : <Mic size={14} />}
                        </button>
                      )}
                      <input
                        type="text"
                        value={chatQuestion}
                        onChange={(e) => setChatQuestion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion(); } }}
                        placeholder={chatStt.listening ? 'Zuhören…' : 'Frage stellen...'}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                          chatStt.listening
                            ? darkMode ? 'bg-red-900/20 border-red-700 text-stone-200' : 'bg-red-50 border-red-300 text-stone-800'
                            : darkMode ? 'bg-stone-800 border-stone-700 text-stone-200 placeholder:text-stone-500' : 'bg-stone-50 border-stone-200 text-stone-800 placeholder:text-stone-400'
                        }`}
                      />
                      <button
                        onClick={askQuestion}
                        disabled={!chatQuestion.trim() || chatLoading}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-30 ${
                          darkMode ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-indigo-900 text-white hover:bg-indigo-800'
                        }`}
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </main>

        {/* ─── Audio Player Footer — sticky, always visible ──── */}
        {currentId !== '__cover__' && (
          <div
            className={`flex-none border-t ${darkMode ? 'border-stone-800 bg-stone-900/95' : 'border-stone-200 bg-white/95'} backdrop-blur-sm`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="max-w-2xl mx-auto px-5 pt-2.5 pb-3 space-y-2">

              {/* Track info */}
              <div className="flex items-center justify-between gap-3">
                <p className={`text-xs font-serif truncate min-w-0 ${
                  isPlaying
                    ? darkMode ? 'text-amber-400' : 'text-amber-700'
                    : darkMode ? 'text-stone-400' : 'text-stone-500'
                }`}>
                  {currentChapter?.isTitlePage
                    ? currentChapter.title
                    : currentChapter
                      ? `${currentChapter.partTitle ? currentChapter.partTitle + ' · ' : ''}${currentChapter.title}`
                      : ''}
                </p>
                <span className={`text-[10px] tabular-nums flex-none ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                  {currentIndex}&thinsp;/&thinsp;{allIds.length - 1}
                </span>
              </div>

              {/* Progress bar — Audio-Position wenn aktiv, sonst Scroll-Position */}
              <div
                className={`h-0.5 rounded-full overflow-hidden ${darkMode ? 'bg-stone-800' : 'bg-stone-200'}`}
                title={isPlaying ? `${Math.round(audio.progress)}% gehört` : `${Math.round(readProgress)}% gelesen`}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ width: `${displayProgress}%` }}
                  animate={{ backgroundColor: isPlaying ? '#f59e0b' : darkMode ? '#57534e' : '#d6d3d1' }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Navigation controls */}
              <div className="flex items-center justify-center gap-4 pt-0.5">
                <button
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className={`p-1.5 rounded-full transition-all disabled:opacity-25 ${darkMode ? 'text-stone-400 hover:text-stone-100 hover:bg-stone-800' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                  title="Vorheriges Kapitel"
                >
                  <SkipBack size={18} />
                </button>

                <button
                  onClick={() => audio.toggle()}
                  disabled={!audio.hasAudio || !!currentChapter?.isTitlePage}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed ${
                    isPlaying
                      ? darkMode ? 'bg-amber-500 text-stone-950 hover:bg-amber-400 scale-105' : 'bg-amber-600 text-white hover:bg-amber-500 scale-105'
                      : darkMode ? 'bg-stone-700 text-stone-100 hover:bg-stone-600' : 'bg-stone-800 text-white hover:bg-stone-700'
                  }`}
                  title={
                    audio.loading ? 'Lädt Audio…'
                      : !audio.hasAudio ? 'Kein Audio verfügbar'
                      : isPlaying ? 'Pause'
                      : currentChapter?.isTitlePage ? 'Auf Titelseiten nicht verfügbar'
                      : 'Kapitel anhören'
                  }
                >
                  {isPlaying
                    ? <Pause size={18} fill="currentColor" />
                    : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                  }
                </button>

                <button
                  onClick={goNext}
                  disabled={currentIndex === allIds.length - 1}
                  className={`p-1.5 rounded-full transition-all disabled:opacity-25 ${darkMode ? 'text-stone-400 hover:text-stone-100 hover:bg-stone-800' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                  title="Nächstes Kapitel"
                >
                  <SkipForward size={18} />
                </button>
              </div>

            </div>
          </div>
        )}
        </div>{/* end content+player column */}
      </div>

      {/* ─── Enkidu KI ──────────────────────────────────────── */}
      {enkiduOpen && (
        <Suspense fallback={<OverlayLoader />}>
          <EnkiduPage onClose={() => setEnkiduOpen(false)} />
        </Suspense>
      )}

      {/* ─── Begriffsnetz ─────────────────────────────────── */}
      {conceptGraphOpen && (
        <Suspense fallback={<OverlayLoader />}>
          <ConceptGraphPage onClose={() => setConceptGraphOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
