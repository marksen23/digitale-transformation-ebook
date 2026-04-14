import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, Menu, X, Download, Search,
  BookOpen, Sun, Moon, ChevronUp, Type, Minus, Plus, Bookmark,
  MessageCircleQuestion, Send, Loader2, BookText,
} from 'lucide-react';
import { parseEbookMarkdown, type EbookData, type Chapter } from '@/lib/parseEbook';

// ─── Helpers ────────────────────────────────────────────────────────
function useLocalStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}

// ─── Main Component ─────────────────────────────────────────────────
export default function Home() {
  // Data
  const [ebook, setEbook] = useState<EbookData | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation
  const [currentId, setCurrentId] = useLocalStorage<string>('ebook-chapter', '__cover__');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Features
  const [darkMode, setDarkMode] = useLocalStorage('ebook-dark', false);
  const [fontSize, setFontSize] = useLocalStorage('ebook-fontsize', 1); // 0=small 1=normal 2=large 3=xlarge
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

  // Keyword popover
  const [activeKeyword, setActiveKeyword] = useState<{ term: string; definition: string; x: number; y: number } | null>(null);

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

  // Scroll tracking
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowScrollTop(el.scrollTop > 400);
      const total = el.scrollHeight - el.clientHeight;
      setReadProgress(total > 0 ? Math.round((el.scrollTop / total) * 100) : 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [currentId]);

  // Scroll to top on chapter change
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentId]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setSearchOpen(o => !o); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

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

  // Sorted terms for the Begriffsverzeichnis
  const sortedKeywords = useMemo(() =>
    Array.from(glossaryMap.keys()).sort((a, b) => a.localeCompare(b, 'de')),
    [glossaryMap]
  );

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
          chapterTitle: currentChapter.title,
          chapterContent: currentChapter.content,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setChatHistory(prev => {
          const copy = [...prev];
          copy[copy.length - 1].a = `Fehler: ${data.error}`;
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
    setCurrentId(id);
    setSidebarOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
  }, [setCurrentId]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  }, [setBookmarks]);

  const fontSizeClasses = ['text-sm leading-relaxed', 'text-base leading-relaxed', 'text-lg leading-relaxed', 'text-xl leading-loose'];

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
    <div className={`min-h-full flex items-center justify-center p-6 ${darkMode ? 'bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950' : 'bg-gradient-to-br from-indigo-950 via-indigo-900 to-stone-900'}`}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-lg w-full"
      >
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-10 text-center space-y-8">
          <div className="space-y-2">
            <p className="text-amber-400 text-xs tracking-[0.3em] uppercase font-medium">Markus Oehring</p>
            <div className="w-16 h-px bg-amber-500/50 mx-auto" />
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-serif text-white tracking-tight leading-tight">
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
              Lesen beginnen
            </button>
            <a
              href="/Die_Digitale_Transformation_Ebook.pdf"
              download
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

  const renderGlossarContent = (chapter: Chapter) => {
    // Parse glossary entries: "Term  Definition text..." pattern
    // Each entry starts with a term followed by two or more spaces and then the definition
    const entries: { term: string; definition: string }[] = [];
    const lines = chapter.content.split('\n');
    let currentTerm = '';
    let currentDef = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if line starts a new glossary entry (Term followed by double-space then definition)
      const match = trimmed.match(/^([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-()„"]+?)\s{2,}(.+)$/);
      if (match) {
        if (currentTerm) {
          entries.push({ term: currentTerm, definition: currentDef.trim() });
        }
        currentTerm = match[1].trim();
        currentDef = match[2];
      } else if (currentTerm) {
        // Continuation of current definition
        currentDef += ' ' + trimmed;
      }
    }
    if (currentTerm) {
      entries.push({ term: currentTerm, definition: currentDef.trim() });
    }

    // Extract intro text (lines before the first definition entry)
    const introEnd = chapter.content.indexOf(entries[0]?.term || '');
    const intro = introEnd > 0 ? chapter.content.slice(0, introEnd).trim() : '';

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

        <div className={`font-serif ${fontSizeClasses[fontSize]} ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
          {intro && <p className="mb-8 italic">{intro}</p>}

          <dl className="space-y-6">
            {entries.map((entry, i) => (
              <div key={i} className={`pb-5 border-b ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                <dt className={`font-semibold mb-1.5 ${darkMode ? 'text-amber-400' : 'text-indigo-900'}`}>
                  {entry.term}
                </dt>
                <dd className={`ml-0 leading-relaxed ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                  {entry.definition}
                </dd>
              </div>
            ))}
          </dl>
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

        <div className={`font-serif ${fontSizeClasses[fontSize]} ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
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

  const renderBegriffsverzeichnis = () => {
    // Group keywords by first letter
    const grouped = new Map<string, string[]>();
    for (const term of sortedKeywords) {
      const letter = term[0].toUpperCase();
      const list = grouped.get(letter) || [];
      list.push(term);
      grouped.set(letter, list);
    }

    return (
      <motion.article
        key="begriffe"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto px-6 md:px-10 py-12 md:py-16"
      >
        <header className="mb-10 md:mb-14">
          <p className="text-amber-600 text-xs tracking-[0.2em] uppercase font-medium mb-3">
            Verzeichnis
          </p>
          <h1 className={`font-serif tracking-tight mb-3 ${darkMode ? 'text-stone-100' : 'text-indigo-950'} text-2xl md:text-3xl`}>
            Begriffsverzeichnis
          </h1>
          <p className={`text-sm mb-4 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
            {glossaryMap.size} Begriffe aus dem Glossar, verknüpft mit ihrem Vorkommen in den Kapiteln.
          </p>
          <div className="mt-6 h-px bg-gradient-to-r from-amber-500/60 via-amber-500/20 to-transparent" />
        </header>

        <div className={`font-serif ${fontSizeClasses[fontSize]} ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
          {/* Letter navigation */}
          <div className="flex flex-wrap gap-1.5 mb-8">
            {Array.from(grouped.keys()).map(letter => (
              <button
                key={letter}
                onClick={() => {
                  document.getElementById(`begriffe-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  darkMode ? 'bg-stone-800 text-stone-300 hover:bg-stone-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>

          {Array.from(grouped.entries()).map(([letter, terms]) => (
            <div key={letter} id={`begriffe-${letter}`} className="mb-8">
              <h3 className={`text-lg font-semibold mb-3 pb-1 border-b ${
                darkMode ? 'text-amber-400 border-stone-800' : 'text-indigo-900 border-stone-200'
              }`}>
                {letter}
              </h3>
              <div className="space-y-3">
                {terms.map(term => {
                  const def = glossaryMap.get(term) || '';
                  const chapters = keywordIndex.get(term) || [];

                  return (
                    <div key={term} className={`pb-3 border-b ${darkMode ? 'border-stone-800/50' : 'border-stone-100'}`}>
                      <button
                        onClick={() => navigateTo('glossar')}
                        className={`font-medium text-sm hover:text-amber-600 transition-colors ${darkMode ? 'text-stone-200' : 'text-stone-800'}`}
                      >
                        {term}
                      </button>
                      <p className={`text-xs mt-1 line-clamp-2 ${darkMode ? 'text-stone-500' : 'text-stone-500'}`}>
                        {def.slice(0, 150)}{def.length > 150 ? '...' : ''}
                      </p>
                      {chapters.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {chapters.slice(0, 5).map(chId => {
                            const ch = ebook?.chapters.find(c => c.id === chId);
                            return ch ? (
                              <button
                                key={chId}
                                onClick={() => navigateTo(chId)}
                                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                                  darkMode ? 'bg-stone-800 text-stone-400 hover:bg-stone-700' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                                }`}
                              >
                                {ch.title.length > 30 ? ch.title.slice(0, 30) + '...' : ch.title}
                              </button>
                            ) : null;
                          })}
                          {chapters.length > 5 && (
                            <span className={`text-[10px] px-2 py-0.5 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                              +{chapters.length - 5} weitere
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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

    // Split content into paragraphs and render with proper typography
    const paragraphs = chapter.content.split('\n\n').filter(p => p.trim());

    return (
      <motion.article
        key={chapter.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto px-6 md:px-10 py-12 md:py-16"
      >
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
          <div className="mt-6 h-px bg-gradient-to-r from-amber-500/60 via-amber-500/20 to-transparent" />
        </header>

        {/* Content */}
        <div className={`font-serif space-y-5 ${fontSizeClasses[fontSize]} ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
          {paragraphs.map((para, i) => {
            const trimmed = para.trim();

            // Detect quotes (lines starting with \u201E or ")
            if (trimmed.startsWith('\u201E') || trimmed.startsWith('"') || trimmed.startsWith('\u00AB')) {
              return (
                <blockquote key={i} className={`border-l-2 border-amber-500/40 pl-5 italic ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                  {renderWithKeywords(trimmed, chapter.id)}
                </blockquote>
              );
            }

            // Detect section subheadings (short lines, no period at end, <80 chars)
            if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.endsWith(':') && !trimmed.endsWith(',') && !trimmed.includes('\n') && /^[A-ZÄÖÜ\d]/.test(trimmed)) {
              return (
                <h3 key={i} className={`font-serif font-semibold text-lg mt-8 mb-4 ${darkMode ? 'text-stone-200' : 'text-indigo-900'}`}>
                  {trimmed}
                </h3>
              );
            }

            return <p key={i}>{renderWithKeywords(trimmed, chapter.id)}</p>;
          })}
        </div>

        {/* Chapter ornament */}
        <div className="mt-14 flex justify-center">
          <span className="text-amber-500/40 text-2xl select-none">&loz;</span>
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
    <div className={`h-screen flex flex-col ${darkMode ? 'bg-stone-950 text-stone-200' : 'bg-stone-50 text-stone-800'}`}>
      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <header className={`flex-none h-12 flex items-center px-4 gap-3 border-b z-30 ${darkMode ? 'bg-stone-900/95 border-stone-800' : 'bg-white/95 border-stone-200'} backdrop-blur-sm`}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-md hover:bg-stone-200/50 dark:hover:bg-stone-700/50 transition-colors" title="Navigation">
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-serif truncate opacity-70">
            {currentId === '__cover__' ? ebook.meta.title : currentChapter?.partTitle}
          </h1>
        </div>

        {/* Progress bar */}
        {currentId !== '__cover__' && (
          <div className={`hidden sm:block w-24 h-1 rounded-full overflow-hidden ${darkMode ? 'bg-stone-800' : 'bg-stone-200'}`}>
            <div className="h-full bg-amber-500 transition-all duration-300 rounded-full" style={{ width: `${readProgress}%` }} />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button onClick={() => setSearchOpen(!searchOpen)} className="p-1.5 rounded-md hover:bg-stone-200/50 transition-colors" title="Suche (Ctrl+F)">
            <Search size={16} />
          </button>

          {/* Font size */}
          <button onClick={() => setFontSize(Math.max(0, fontSize - 1))} className="p-1.5 rounded-md hover:bg-stone-200/50 transition-colors" title="Kleiner" disabled={fontSize === 0}>
            <Minus size={14} />
          </button>
          <Type size={14} className="opacity-40" />
          <button onClick={() => setFontSize(Math.min(3, fontSize + 1))} className="p-1.5 rounded-md hover:bg-stone-200/50 transition-colors" title="Größer" disabled={fontSize === 3}>
            <Plus size={14} />
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

          {/* Begriffsverzeichnis */}
          <button onClick={() => navigateTo('__begriffe__')} className={`p-1.5 rounded-md transition-colors ${currentId === '__begriffe__' ? 'text-amber-500' : 'hover:bg-stone-200/50'}`} title="Begriffsverzeichnis">
            <BookText size={16} />
          </button>

          {/* Dark mode */}
          <button onClick={() => setDarkMode(!darkMode)} className="p-1.5 rounded-md hover:bg-stone-200/50 transition-colors" title="Darstellungsmodus">
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

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

        {/* ─── Sidebar ──────────────────────────────────────── */}
        <aside
          className={`
            fixed md:static z-30 top-12 bottom-0 left-0 w-72 flex-none overflow-y-auto
            border-r transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}
          `}
        >
          <nav className="p-4 space-y-1">
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

              return (
                <div key={part.id} className="pt-3">
                  <p className={`px-3 text-[10px] tracking-[0.15em] uppercase font-semibold mb-1 ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                    {part.title}
                  </p>
                  {part.subtitle && (
                    <p className={`px-3 text-[10px] italic mb-2 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                      {part.subtitle}
                    </p>
                  )}
                  {partChapters.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => navigateTo(ch.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                        currentId === ch.id
                          ? 'bg-amber-500/15 text-amber-700 font-medium'
                          : darkMode ? 'text-stone-400 hover:bg-stone-800 hover:text-stone-200' : 'text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {bookmarks.includes(ch.id) && <Bookmark size={10} className="text-amber-500 flex-none" fill="currentColor" />}
                      <span className="truncate">{ch.title}</span>
                    </button>
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

            {/* PDF download */}
            <div className="pt-4 border-t border-stone-200 dark:border-stone-800 mt-4">
              <a
                href="/Die_Digitale_Transformation_Ebook.pdf"
                download
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-600 hover:bg-amber-500/10 transition-colors"
              >
                <Download size={14} />
                PDF herunterladen
              </a>
            </div>
          </nav>
        </aside>

        {/* ─── Main Content ─────────────────────────────────── */}
        <main ref={contentRef} className="flex-1 overflow-y-auto relative" onClick={() => setActiveKeyword(null)}>
          {currentId === '__cover__'
            ? renderCover()
            : currentId === '__begriffe__'
              ? renderBegriffsverzeichnis()
              : currentChapter && renderChapterContent(currentChapter)}

          {/* Navigation footer */}
          {currentId !== '__cover__' && currentId !== '__begriffe__' && (
            <div className={`border-t px-6 py-4 ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
              <div className="max-w-2xl mx-auto flex items-center justify-between">
                <button
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className={`flex items-center gap-1 text-xs px-4 py-2 rounded-lg transition-colors disabled:opacity-30 ${
                    darkMode ? 'hover:bg-stone-800 text-stone-400' : 'hover:bg-stone-100 text-stone-600'
                  }`}
                >
                  <ChevronLeft size={14} />
                  Zurück
                </button>
                <span className={`text-xs ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>
                  {currentIndex} / {allIds.length - 1}
                </span>
                <button
                  onClick={goNext}
                  disabled={currentIndex === allIds.length - 1}
                  className={`flex items-center gap-1 text-xs px-4 py-2 rounded-lg transition-colors disabled:opacity-30 ${
                    darkMode ? 'hover:bg-stone-800 text-stone-400' : 'hover:bg-stone-100 text-stone-600'
                  }`}
                >
                  Weiter
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

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
                className={`fixed bottom-6 right-6 p-3 rounded-full shadow-lg z-10 transition-colors ${
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
                    className={`fixed bottom-6 right-6 p-3.5 rounded-full shadow-lg z-20 transition-colors ${
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
                    className={`fixed bottom-4 right-4 w-[360px] max-h-[500px] z-40 rounded-2xl shadow-2xl border flex flex-col overflow-hidden ${
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
                            <div className="flex justify-start">
                              <div className={`max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2 text-xs leading-relaxed ${
                                darkMode ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700'
                              }`}>
                                {entry.a.split('\n\n').map((p, j) => (
                                  <p key={j} className={j > 0 ? 'mt-2' : ''}>{p}</p>
                                ))}
                              </div>
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
                      <input
                        type="text"
                        value={chatQuestion}
                        onChange={(e) => setChatQuestion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion(); } }}
                        placeholder="Frage stellen..."
                        className={`flex-1 px-3 py-2 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                          darkMode ? 'bg-stone-800 border-stone-700 text-stone-200 placeholder:text-stone-500' : 'bg-stone-50 border-stone-200 text-stone-800 placeholder:text-stone-400'
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
      </div>
    </div>
  );
}
