import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, Menu, X, Download, Search,
  BookOpen, Sun, Moon, ChevronUp, Type, Minus, Plus, Bookmark,
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

  const currentChapter = ebook?.chapters.find(c => c.id === currentId);

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

  const renderChapterContent = (chapter: Chapter) => {
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
                  {trimmed}
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

            return <p key={i}>{trimmed}</p>;
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
        <main ref={contentRef} className="flex-1 overflow-y-auto relative">
          {currentId === '__cover__' ? renderCover() : currentChapter && renderChapterContent(currentChapter)}

          {/* Navigation footer */}
          {currentId !== '__cover__' && (
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

          {/* Scroll to top */}
          <AnimatePresence>
            {showScrollTop && (
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
        </main>
      </div>
    </div>
  );
}
