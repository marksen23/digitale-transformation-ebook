import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Menu, X, Download, Search } from 'lucide-react';

type PageType = 'cover' | 'toc' | 'foreword' | 'preamble' | 'band1' | 'band2' | 'band3';

interface BandPage {
  page_number: number;
  content: string;
}

interface BandContent {
  band1: BandPage[];
  band2: BandPage[];
  band3: BandPage[];
}

export default function Home() {
  const [currentPage, setCurrentPage] = useState<PageType>('cover');
  const [currentBandPage, setCurrentBandPage] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bandContent, setBandContent] = useState<BandContent>({
    band1: [],
    band2: [],
    band3: []
  });
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const coverImageUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031698054/5yUeNH5dJXniB39r539Tam/ebook-cover-dWYVH4zCVZtQggBPMstjWx.webp';
  const band1ImageUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031698054/5yUeNH5dJXniB39r539Tam/band1-gilgamesch-EL6HX4ux2KRS7gfCpZBWde.webp';
  const band2ImageUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031698054/5yUeNH5dJXniB39r539Tam/band2-kant-BYmcBe2WQexcxWBXoHwcJW.webp';
  const band3ImageUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031698054/5yUeNH5dJXniB39r539Tam/band3-resonance-CetYFSECgyaxrS5g5cASpM.webp';

  // Lade die Seiteninhalte beim Komponenten-Mount
  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetch('/bands_pages.json');
        const data: BandContent = await response.json();
        setBandContent(data);
      } catch (error) {
        console.error('Fehler beim Laden der Inhalte:', error);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, []);

  // Lade Lesefortschritt aus LocalStorage
  useEffect(() => {
    const savedPage = localStorage.getItem('ebook-current-page');
    const savedBandPage = localStorage.getItem('ebook-band-page');
    if (savedPage) setCurrentPage(savedPage as PageType);
    if (savedBandPage) setCurrentBandPage(parseInt(savedBandPage));
  }, []);

  // Speichere Lesefortschritt
  useEffect(() => {
    localStorage.setItem('ebook-current-page', currentPage);
    localStorage.setItem('ebook-band-page', currentBandPage.toString());
  }, [currentPage, currentBandPage]);

  const chapters = [
    { id: 'cover' as PageType, title: 'Frontcover', label: 'Cover' },
    { id: 'toc' as PageType, title: 'Inhaltsverzeichnis', label: 'Inhalt' },
    { id: 'foreword' as PageType, title: 'Vorwort', label: 'Vorwort' },
    { id: 'preamble' as PageType, title: 'Präambel zur Trilogie', label: 'Präambel' },
    { id: 'band1' as PageType, title: 'Band I: Die Überführung', label: 'Band I' },
    { id: 'band2' as PageType, title: 'Band II: Der Ausgang', label: 'Band II' },
    { id: 'band3' as PageType, title: 'Band III: Die Rückbindung', label: 'Band III' },
  ];

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Suchfunktion kann später implementiert werden
  };

  const downloadPDF = () => {
    // PDF-Download-Funktion
    const link = document.createElement('a');
    link.href = '/Die_Digitale_Transformation_Ebook.pdf';
    link.download = 'Die_Digitale_Transformation.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderCover = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
          <img 
            src={coverImageUrl}
            alt="Die Digitale Transformation Cover"
            className="w-full h-auto"
          />
          <div className="p-8 bg-white">
            <h1 className="text-3xl font-serif text-indigo-900 mb-2">Die Digitale Transformation</h1>
            <p className="text-gray-600 text-lg mb-4">Eine poetisch-philosophische Trilogie mit theoretischer Grundlegung in drei Kritiken</p>
            <p className="text-gray-500">von Markus Oehring</p>
            <p className="text-gray-400 text-sm mt-4">März 2026</p>
          </div>
        </div>
        <div className="mt-8 flex gap-4 justify-center">
          <Button 
            onClick={() => setCurrentPage('toc')}
            className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-2"
          >
            Zum Inhaltsverzeichnis
          </Button>
          <Button 
            onClick={downloadPDF}
            variant="outline"
            className="border-amber-600 text-amber-600 hover:bg-amber-50 px-8 py-2"
          >
            <Download size={18} className="mr-2" />
            PDF herunterladen
          </Button>
        </div>
      </div>
    </div>
  );

  const renderTableOfContents = () => (
    <div className="ebook-page">
      <div className="ebook-page-content">
        <div>
          <h1 className="text-3xl font-serif text-indigo-900 mb-2">Inhaltsverzeichnis</h1>
          <div className="ebook-divider mb-6"></div>
          
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-serif text-indigo-900 mb-3">Hauptteile</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center cursor-pointer hover:text-amber-600 transition-colors" onClick={() => setCurrentPage('foreword')}>
                  <span className="text-amber-600 mr-3">•</span>Vorwort
                </li>
                <li className="flex items-center cursor-pointer hover:text-amber-600 transition-colors" onClick={() => setCurrentPage('preamble')}>
                  <span className="text-amber-600 mr-3">•</span>Präambel zur Trilogie
                </li>
                <li className="flex items-center cursor-pointer hover:text-amber-600 transition-colors" onClick={() => { setCurrentPage('band1'); setCurrentBandPage(0); }}>
                  <span className="text-amber-600 mr-3">•</span>Band I: Die Überführung
                </li>
                <li className="flex items-center cursor-pointer hover:text-amber-600 transition-colors" onClick={() => { setCurrentPage('band2'); setCurrentBandPage(0); }}>
                  <span className="text-amber-600 mr-3">•</span>Band II: Der Ausgang
                </li>
                <li className="flex items-center cursor-pointer hover:text-amber-600 transition-colors" onClick={() => { setCurrentPage('band3'); setCurrentBandPage(0); }}>
                  <span className="text-amber-600 mr-3">•</span>Band III: Die Rückbindung
                </li>
              </ul>
            </div>
          </div>

          <div className="ebook-section-break">
            <span className="ebook-ornament">✦</span>
          </div>

          <div className="p-4 bg-indigo-50 rounded border border-amber-200 text-xs">
            <p className="text-gray-700 italic">
              "Dieses Werk entstand in einer Zeit, in der die Frage nach dem Verhältnis von Mensch und Maschine aufgehört hat, eine akademische Frage zu sein."
            </p>
          </div>
        </div>
      </div>
      
      <div className="ebook-page-footer">
        Inhaltsverzeichnis
      </div>
    </div>
  );

  const renderForeword = () => (
    <div className="ebook-page">
      <div className="ebook-page-content">
        <div className="ebook-chapter-title">Einleitung</div>
        <h1 className="text-3xl font-serif text-indigo-900 mb-2">Vorwort</h1>
        
        <div className="ebook-divider mb-6"></div>

        <div className="ebook-page-text">
          {`Dieses Werk entstand in einer Zeit, in der die Frage nach dem Verhältnis von Mensch und Maschine aufgehört hat, eine akademische Frage zu sein. Sie ist zur existenziellen Frage geworden – für jeden, der morgens einen Bildschirm einschaltet und abends feststellt, dass der Tag ohne ihn vergangen ist.

Die drei Bände der Trilogie unternehmen den Versuch, diese Frage nicht zu beantworten, sondern zu überführen: die großen philosophischen Traditionen – Mythos, Aufklärung, Existenzphilosophie – in eine Sprache zu verwandeln, die der digitalen Gegenwart gewachsen ist. Die Methode ist poetisch, weil die Erfahrung der digitalen Transformation sich der rein analytischen Prosa entzieht. Wer nur erklärt, wie Algorithmen funktionieren, versteht nicht, wie es sich anfühlt, von ihnen gekannt zu werden.

Die Teile IV bis VII – die Leitmotiv-Analyse und die drei Kritiken der Resonanzvernunft – liefern den theoretischen Rahmen, den die Poesie allein nicht tragen kann. Sie entfalten, was in den Versen verdichtet ist: eine Epistemologie des Zwischen, eine Ethik der Begegnung und eine Ontologie des Relationalen. Dass diese Theorie aus der Dichtung hervorgeht und nicht umgekehrt, ist kein Zufall – es ist die These des Werks: Der Mythos geht der Vernunft voraus und bereitet ihr den Boden.

Das Werk ist nicht abgeschlossen. Es beansprucht nicht, die Fragen des digitalen Zeitalters zu beantworten. Es beansprucht, sie so zu stellen, dass eine Antwort möglich wird – nicht als Theorie, sondern als gelebte Resonanz.`}
        </div>
      </div>
      
      <div className="ebook-page-footer">
        Vorwort
      </div>
    </div>
  );

  const renderPreamble = () => (
    <div className="ebook-page">
      <div className="ebook-page-content">
        <h1 className="text-3xl font-serif text-indigo-900 mb-2">Präambel zur Trilogie</h1>
        <p className="text-lg text-amber-600 font-serif mb-4">Von der Erschöpfung zur Erneuerung</p>
        
        <div className="ebook-divider mb-6"></div>

        <div className="ebook-page-text text-xs">
          {`In drei Gesängen erzählt diese Trilogie vom Menschen im digitalen Zeitalter – nicht als Warnung, nicht als Utopie, sondern als Überführung der großen philosophischen Traditionen in die Gegenwart.

Die Erschöpfung der klassischen Philosophie ist keine Niederlage, sondern eine Transformation. Wie sich Raupe in Schmetterling verwandelt, so wandeln sich die alten Weisheiten in neue Formen – ohne ihre Essenz zu verlieren.

Die drei Säulen der Transformation

Band I: Die Überführung (Gilgamesch)
Vom Mythos zur Technologie

Die älteste überlieferte Geschichte der Menschheit – die Suche nach Unsterblichkeit – wird neu erzählt im Zeitalter der Künstlichen Intelligenz. Gilgamesch wird zum König der Server, Enkidu wird zu Code, und die uralte Frage nach dem ewigen Leben zeigt sich als Suche nach digitaler Ewigkeit.

Kernfrage: Welche menschlichen Grundfragen bleiben konstant, auch wenn sich die Welt verwandelt?

Band II: Der Ausgang (Kant)
Von der Vernunft zur Koexistenz

Kants Aufklärung – der Ausgang aus selbstverschuldeter Unmündigkeit – wird überführt in das Zeitalter der algorithmischen Systeme. Die Frage nach Mündigkeit stellt sich neu: Wie kann der Mensch mündig bleiben, wenn Maschinen für ihn denken?

Kernfrage: Was bedeutet Vernunft und Selbstbestimmung im Zeitalter der Maschinenvernunft?

Band III: Die Rückbindung (Heidegger/Levinas/Rosa)
Von der Entfremdung zur Resonanz

Die existenzielle Frage nach Authentizität und Begegnung wird gestellt in einer Welt der Feeds, Likes und Algorithmen. Die Rückbindung (religio) ist nicht Regression, sondern Integration – der Weg zu einem Leben in bewusster Koexistenz mit der Technologie.

Kernfrage: Wie finden wir Resonanz und authentische Begegnung in einer entfremdeten digitalen Welt?`}
        </div>
      </div>
      
      <div className="ebook-page-footer">
        Präambel
      </div>
    </div>
  );

  const renderBandPages = (band: BandPage[], bandTitle: string, bandSubtitle: string, bandImage: string) => {
    if (band.length === 0) {
      return (
        <div className="ebook-page flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 text-lg">Inhalte werden geladen...</p>
          </div>
        </div>
      );
    }

    const currentPageData = band[currentBandPage];
    if (!currentPageData) {
      return (
        <div className="ebook-page flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 text-lg">Seite nicht gefunden</p>
          </div>
        </div>
      );
    }

    const isFirstPage = currentBandPage === 0;

    return (
      <div className="ebook-page">
        <div className="ebook-page-content">
          {isFirstPage && (
            <>
              <div className="mb-6 -mx-6 -mt-12">
                <img 
                  src={bandImage}
                  alt={bandTitle}
                  className="w-full h-48 object-cover"
                />
              </div>
              
              <div className="ebook-chapter-title">Band {bandTitle.split(':')[0].trim()}</div>
              <h1 className="text-3xl font-serif text-indigo-900 mb-1">{bandTitle.split(':')[1]?.trim()}</h1>
              <p className="text-sm text-amber-600 font-serif mb-4">{bandSubtitle}</p>
              
              <div className="ebook-divider mb-6"></div>
            </>
          )}

          <div className="ebook-page-text text-xs">
            {currentPageData.content}
          </div>
        </div>

        <div className="ebook-page-footer">
          Seite {currentPageData.page_number}
        </div>
      </div>
    );
  };

  const renderBand1 = () => {
    if (bandContent.band1.length === 0) {
      return (
        <div className="ebook-page flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">Inhalte werden geladen...</p>
          </div>
        </div>
      );
    }
    return renderBandPages(bandContent.band1, 'I: Die Überführung', 'Gilgamesch im digitalen Zeitalter', band1ImageUrl);
  };

  const renderBand2 = () => {
    if (bandContent.band2.length === 0) {
      return (
        <div className="ebook-page flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">Inhalte werden geladen...</p>
          </div>
        </div>
      );
    }
    return renderBandPages(bandContent.band2, 'II: Der Ausgang', 'Kant im Zeitalter der Maschinenvernunft', band2ImageUrl);
  };

  const renderBand3 = () => {
    if (bandContent.band3.length === 0) {
      return (
        <div className="ebook-page flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">Inhalte werden geladen...</p>
          </div>
        </div>
      );
    }
    return renderBandPages(bandContent.band3, 'III: Die Rückbindung', 'Resonanz im Zeitalter der Entfremdung', band3ImageUrl);
  };

  const renderContent = () => {
    switch(currentPage) {
      case 'cover':
        return renderCover();
      case 'toc':
        return renderTableOfContents();
      case 'foreword':
        return renderForeword();
      case 'preamble':
        return renderPreamble();
      case 'band1':
        return renderBand1();
      case 'band2':
        return renderBand2();
      case 'band3':
        return renderBand3();
      default:
        return renderCover();
    }
  };

  const getPageIndex = () => {
    return chapters.findIndex(ch => ch.id === currentPage);
  };

  const goToPreviousPage = () => {
    const currentIndex = getPageIndex();
    if (currentIndex > 0) {
      setCurrentPage(chapters[currentIndex - 1].id);
      setCurrentBandPage(0);
    }
  };

  const goToNextPage = () => {
    const currentIndex = getPageIndex();
    if (currentIndex < chapters.length - 1) {
      setCurrentPage(chapters[currentIndex + 1].id);
      setCurrentBandPage(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-50">
      {/* Mobile Menu */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white shadow-md z-50 flex items-center justify-between p-4">
        <h1 className="text-lg font-serif text-indigo-900">Die Digitale Transformation</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => setSearchOpen(!searchOpen)}
            className="text-indigo-900 p-2"
          >
            <Search size={20} />
          </button>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-indigo-900 p-2"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div className="md:hidden fixed top-16 left-0 right-0 bg-white border-b border-gray-200 p-4 z-40">
          <input
            type="text"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600"
          />
        </div>
      )}

      <div className="flex pt-16 md:pt-0">
        {/* Sidebar Navigation */}
        <div className={`
          fixed md:relative w-64 bg-white shadow-lg h-screen overflow-y-auto
          transform transition-transform duration-300 z-40
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          md:translate-x-0
        `}>
          <div className="p-6">
            <h2 className="text-xl font-serif text-indigo-900 mb-6">Navigation</h2>
            <nav className="space-y-2">
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => {
                    setCurrentPage(chapter.id);
                    setCurrentBandPage(0);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 rounded transition-colors text-sm ${
                    currentPage === chapter.id
                      ? 'bg-amber-100 text-indigo-900 font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {chapter.label}
                </button>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <Button 
                onClick={downloadPDF}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2"
                size="sm"
              >
                <Download size={16} />
                PDF herunterladen
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 w-full md:w-auto">
          {renderContent()}

          {/* Band Page Navigation */}
          {['band1', 'band2', 'band3'].includes(currentPage) && (
            <div className="bg-white border-t border-gray-200 p-4 flex justify-between items-center max-w-4xl mx-auto">
              <Button 
                onClick={() => setCurrentBandPage(Math.max(0, currentBandPage - 1))}
                variant="outline"
                size="sm"
                disabled={currentBandPage === 0}
              >
                <ChevronLeft size={18} className="mr-1" />
                Vorherige
              </Button>
              <span className="text-xs text-gray-600">
                Seite {currentBandPage + 1} / {bandContent[currentPage as keyof BandContent]?.length || 0}
              </span>
              <Button 
                onClick={() => {
                  const band = bandContent[currentPage as keyof BandContent];
                  setCurrentBandPage(Math.min(band.length - 1, currentBandPage + 1));
                }}
                variant="outline"
                size="sm"
                disabled={currentBandPage === (bandContent[currentPage as keyof BandContent]?.length || 0) - 1}
              >
                Nächste
                <ChevronRight size={18} className="ml-1" />
              </Button>
            </div>
          )}

          {/* Chapter Navigation */}
          {!['band1', 'band2', 'band3'].includes(currentPage) && (
            <div className="bg-white border-t border-gray-200 p-4 flex justify-between items-center max-w-4xl mx-auto">
              <Button 
                onClick={goToPreviousPage}
                variant="outline"
                size="sm"
                disabled={getPageIndex() === 0}
              >
                <ChevronLeft size={18} className="mr-1" />
                Zurück
              </Button>
              <span className="text-xs text-gray-600">
                Kapitel {getPageIndex() + 1} / {chapters.length}
              </span>
              <Button 
                onClick={goToNextPage}
                variant="outline"
                size="sm"
                disabled={getPageIndex() === chapters.length - 1}
              >
                Weiter
                <ChevronRight size={18} className="ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
