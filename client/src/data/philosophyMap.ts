/**
 * philosophyMap.ts — handkuratierte Karte der philosophischen
 * Verortung von Resonanzvernunft. Vorgänger, Zeitgenossen, kritische
 * Stimmen, wissenschaftliche Anschlüsse.
 *
 * Drei Schichten:
 *   1. Traditionen (Strömungen mit zeitlicher Spanne + Farbband)
 *   2. Philosophen (Eckpunkte, datiert, in einer Tradition verankert)
 *   3. Wissenschafts-Anschlüsse (moderne Disziplinen, an die der
 *      Resonanz-Diskurs andockt)
 *
 * Die `position`-Achse beschreibt die Beziehung zu Resonanzvernunft
 * aus der Perspektive des Werks selbst — sie ist deutungsoffen, nicht
 * neutral.
 */

export type TraditionId =
  | "vorlaeufer"      // Spinoza, Leibniz — vor-deutscher Resonanzgedanke
  | "idealismus"      // Kant, Hegel, Schelling
  | "phaenomenologie" // Husserl, Heidegger, Merleau-Ponty
  | "hermeneutik"     // Gadamer, Ricœur
  | "frankfurter-schule" // Benjamin, Adorno, Habermas, Honneth
  | "lebensphilosophie" // Bergson, Wittgenstein
  | "resonanz"        // Rosa, Waldenfels, Reckwitz, Taylor
  | "wissenschaft";   // Sociology + Biology of Cognition + Physics

export type ScienceLinkId =
  | "kognitionswissenschaft"
  | "komplexitaetstheorie"
  | "beschleunigungssoziologie"
  | "neurowissenschaft"
  | "quantenphysik";

export type Position =
  | "fundament"      // konstitutiver Vorgänger
  | "vorlaeufer"     // anschlussfähig, ohne direkte Linie
  | "kritik"         // an dem sich Resonanzvernunft abarbeitet
  | "zeitgenosse"    // gegenwärtige Diskussion
  | "anschluss"      // wissenschaftliche oder methodische Erweiterung
  | "parallel";      // verwandt aber unabhängig entstanden

export interface Philosopher {
  id: string;
  name: string;
  born: number;
  died?: number;
  tradition: TraditionId;
  position: Position;
  /** 1-2 Sätze: warum für Resonanzvernunft relevant. */
  resonanzNote: string;
  keyWorks: Array<{ title: string; year: number }>;
  /** IDs von Philosophen, die rezipiert wurden. */
  receives?: string[];
  /** IDs von Philosophen, die kritisiert wurden. */
  critiques?: string[];
  scienceLinks?: ScienceLinkId[];
  /**
   * Konzept-IDs aus dem Begriffsnetz, mit denen dieser Philosoph
   * besonders eng verbunden ist. Erlaubt Cross-Link zu /resonanzen?tag=...
   * — die Brücke zwischen Karte und Korpus.
   */
  concepts?: string[];
  /**
   * Eine kurze Signatur-Phrase in der Stimme des Denkers — ein Zitat
   * oder prägnanter Begriff. Wird im Buch-View als handschriftliches
   * Fragment dargestellt. Manche paraphrasiert, nicht alle wörtlich.
   */
  signaturePhrase?: string;
}

export interface Tradition {
  id: TraditionId;
  name: string;
  /** 1 Satz: das Movens dieser Strömung. */
  blurb: string;
  spanFrom: number;
  spanTo: number;
  color: string;
}

export interface ScienceLink {
  id: ScienceLinkId;
  name: string;
  description: string;
  exemplars: string[];   // Namen, keine IDs (Wissenschaftler statt Philosophen)
}

// ─── Traditionen ──────────────────────────────────────────────────────────

export const TRADITIONS: Tradition[] = [
  {
    id: "vorlaeufer",
    name: "Frühe Resonanz-Vorläufer",
    blurb: "Substanzdenken vor Kant — die Welt als gestimmtes Ganzes, nicht als Material.",
    spanFrom: 1620, spanTo: 1750,
    color: "#7a8a6a",
  },
  {
    id: "idealismus",
    name: "Deutscher Idealismus",
    blurb: "Vernunft baut Welt — und sieht erst spät, dass sie auch von Welt gebaut wird.",
    spanFrom: 1770, spanTo: 1850,
    color: "#a89060",
  },
  {
    id: "phaenomenologie",
    name: "Phänomenologie",
    blurb: "Zurück zu den Sachen selbst: Bewusstsein ist immer schon bei der Welt.",
    spanFrom: 1890, spanTo: 1970,
    color: "#5aacb8",
  },
  {
    id: "hermeneutik",
    name: "Hermeneutik",
    blurb: "Verstehen geschieht im Zwischen — Horizontverschmelzung statt Subjekt-Objekt.",
    spanFrom: 1900, spanTo: 2010,
    color: "#f59e0b",
  },
  {
    id: "frankfurter-schule",
    name: "Kritische Theorie",
    blurb: "Vernunft hat eine Geschichte — und die ist auch eine der Verdunkelung.",
    spanFrom: 1920, spanTo: 2025,
    color: "#9c7a8a",
  },
  {
    id: "lebensphilosophie",
    name: "Lebens- und Sprachphilosophie",
    blurb: "Begriffe sind keine Container, Lebensformen lassen sich nicht abstrahieren.",
    spanFrom: 1880, spanTo: 1980,
    color: "#7aa890",
  },
  {
    id: "resonanz",
    name: "Resonanz & Beschleunigung",
    blurb: "Beziehung als Grundkategorie der Spätmoderne — antwortend statt verfügend.",
    spanFrom: 1990, spanTo: 2030,
    color: "#c48282",
  },
  {
    id: "wissenschaft",
    name: "Wissenschaftliche Anschlüsse",
    blurb: "Wo Philosophie auf empirische Disziplinen trifft — Brücken statt Reduktion.",
    spanFrom: 1940, spanTo: 2030,
    color: "#5a7ab8",
  },
];

// ─── Philosophen ─────────────────────────────────────────────────────────

export const PHILOSOPHERS: Philosopher[] = [
  // ── Vorläufer ──
  {
    id: "spinoza",
    name: "Baruch Spinoza",
    born: 1632, died: 1677,
    tradition: "vorlaeufer",
    position: "vorlaeufer",
    resonanzNote: "Substanz als das was in sich ist und durch sich begriffen wird — der Boden, auf dem Resonanz später ohne Subjekt-Objekt-Spaltung gedacht werden kann. Affekte als Beziehungsmodi.",
    keyWorks: [
      { title: "Ethica, ordine geometrico demonstrata", year: 1677 },
      { title: "Tractatus theologico-politicus", year: 1670 },
    ],
  },
  {
    id: "leibniz",
    name: "Gottfried Wilhelm Leibniz",
    born: 1646, died: 1716,
    tradition: "vorlaeufer",
    position: "vorlaeufer",
    resonanzNote: "Monaden als spiegelnde Welt-Knoten ohne Fenster, prästabilierte Harmonie als nicht-kausale Korrespondenz — gedankliche Vorform einer relationalen Welt.",
    keyWorks: [
      { title: "Monadologie", year: 1714 },
      { title: "Théodicée", year: 1710 },
    ],
  },

  // ── Idealismus ──
  {
    id: "kant",
    name: "Immanuel Kant",
    born: 1724, died: 1804,
    tradition: "idealismus",
    position: "kritik",
    resonanzNote: "Begründer der modernen Vernunftarchitektur — und damit jener Subjekt-Welt-Trennung, die Resonanzvernunft zu unterlaufen sucht. Ohne Kant kein Bedarf an Resonanzvernunft.",
    keyWorks: [
      { title: "Kritik der reinen Vernunft", year: 1781 },
      { title: "Kritik der praktischen Vernunft", year: 1788 },
      { title: "Kritik der Urteilskraft", year: 1790 },
    ],
    critiques: ["spinoza"],
  },
  {
    id: "schelling",
    name: "Friedrich Wilhelm Joseph Schelling",
    born: 1775, died: 1854,
    tradition: "idealismus",
    position: "fundament",
    resonanzNote: "Naturphilosophie als Versuch, Geist und Natur nicht zu trennen — Identitätsphilosophie, in der Subjekt und Objekt ein gemeinsames Drittes haben. Direkte Brücke zur späteren Resonanzfigur.",
    keyWorks: [
      { title: "Ideen zu einer Philosophie der Natur", year: 1797 },
      { title: "System des transzendentalen Idealismus", year: 1800 },
    ],
    receives: ["spinoza"],
  },
  {
    id: "hegel",
    name: "Georg Wilhelm Friedrich Hegel",
    born: 1770, died: 1831,
    tradition: "idealismus",
    position: "fundament",
    resonanzNote: "Geist ist Beziehung, nicht Substanz — Anerkennung als konstitutive Kategorie. Die Dialektik liefert das Denkschema, in dem Beziehung produktiv wird.",
    keyWorks: [
      { title: "Phänomenologie des Geistes", year: 1807 },
      { title: "Wissenschaft der Logik", year: 1816 },
    ],
    receives: ["kant", "spinoza"],
  },

  // ── Phänomenologie ──
  {
    id: "husserl",
    name: "Edmund Husserl",
    born: 1859, died: 1938,
    tradition: "phaenomenologie",
    position: "fundament",
    resonanzNote: "Intentionalität: Bewusstsein ist immer Bewusstsein-von-etwas. Lebenswelt als vorgegebener Horizont — die Erde, auf der Resonanz möglich ist.",
    keyWorks: [
      { title: "Logische Untersuchungen", year: 1900 },
      { title: "Ideen zu einer reinen Phänomenologie", year: 1913 },
      { title: "Die Krisis der europäischen Wissenschaften", year: 1936 },
    ],
    critiques: ["kant"],
  },
  {
    id: "heidegger",
    name: "Martin Heidegger",
    born: 1889, died: 1976,
    tradition: "phaenomenologie",
    position: "fundament",
    resonanzNote: "Sein-in-der-Welt verwirft die Trennung von Subjekt und Objekt. Gelassenheit, das ungestellte Sein, der Bezug statt das Verfügen — Schlüsselbegriffe für Resonanzvernunft.",
    keyWorks: [
      { title: "Sein und Zeit", year: 1927 },
      { title: "Die Frage nach der Technik", year: 1953 },
      { title: "Gelassenheit", year: 1959 },
    ],
    receives: ["husserl", "kant"],
    scienceLinks: ["kognitionswissenschaft"],
  },
  {
    id: "merleau-ponty",
    name: "Maurice Merleau-Ponty",
    born: 1908, died: 1961,
    tradition: "phaenomenologie",
    position: "fundament",
    resonanzNote: "Der Leib als Ort der Welt-Berührung. Wahrnehmung ist nicht Repräsentation, sondern Resonanz mit dem Wahrgenommenen.",
    keyWorks: [
      { title: "Phänomenologie der Wahrnehmung", year: 1945 },
      { title: "Das Sichtbare und das Unsichtbare", year: 1964 },
    ],
    receives: ["husserl", "heidegger"],
    scienceLinks: ["kognitionswissenschaft", "neurowissenschaft"],
  },

  // ── Hermeneutik ──
  {
    id: "gadamer",
    name: "Hans-Georg Gadamer",
    born: 1900, died: 2002,
    tradition: "hermeneutik",
    position: "fundament",
    resonanzNote: "Verstehen als Spiel und Horizontverschmelzung. Wahrheit geschieht im Dialog, nicht in der Methode — direkte Vorlage für eine antwortende Vernunft.",
    keyWorks: [
      { title: "Wahrheit und Methode", year: 1960 },
    ],
    receives: ["heidegger", "hegel"],
  },
  {
    id: "ricoeur",
    name: "Paul Ricœur",
    born: 1913, died: 2005,
    tradition: "hermeneutik",
    position: "fundament",
    resonanzNote: "Das Selbst als Anderer — narrative Identität als ständige Antwort auf Anrufe. Erzählung als Form der Resonanz mit dem Eigenen.",
    keyWorks: [
      { title: "Zeit und Erzählung", year: 1985 },
      { title: "Das Selbst als ein Anderer", year: 1990 },
    ],
    receives: ["husserl", "gadamer"],
  },

  // ── Frankfurter Schule ──
  {
    id: "benjamin",
    name: "Walter Benjamin",
    born: 1892, died: 1940,
    tradition: "frankfurter-schule",
    position: "vorlaeufer",
    resonanzNote: "Aura als Hier-und-Jetzt-Charakter, der sich im Zeitalter der technischen Reproduktion verliert — eine frühe Diagnose dessen, was Rosa später als Resonanzverlust beschreibt.",
    keyWorks: [
      { title: "Das Kunstwerk im Zeitalter seiner technischen Reproduzierbarkeit", year: 1936 },
      { title: "Über den Begriff der Geschichte", year: 1940 },
    ],
  },
  {
    id: "adorno",
    name: "Theodor W. Adorno",
    born: 1903, died: 1969,
    tradition: "frankfurter-schule",
    position: "kritik",
    resonanzNote: "Negative Dialektik: das Nicht-Identische ehren statt subsumieren. Mimesis als nicht-instrumentelle Annäherung — verwandt mit dem Resonanz-Gedanken, aber pessimistischer.",
    keyWorks: [
      { title: "Dialektik der Aufklärung", year: 1944 },
      { title: "Negative Dialektik", year: 1966 },
    ],
    receives: ["hegel", "benjamin"],
    critiques: ["kant"],
  },
  {
    id: "habermas",
    name: "Jürgen Habermas",
    born: 1929,
    tradition: "frankfurter-schule",
    position: "zeitgenosse",
    resonanzNote: "Kommunikative Rationalität: Vernunft realisiert sich im verständigungsorientierten Sprechen. Strukturparallele zur Resonanzvernunft, aber stärker prozedural gefasst.",
    keyWorks: [
      { title: "Theorie des kommunikativen Handelns", year: 1981 },
      { title: "Faktizität und Geltung", year: 1992 },
    ],
    receives: ["kant", "hegel", "adorno"],
  },
  {
    id: "honneth",
    name: "Axel Honneth",
    born: 1949,
    tradition: "frankfurter-schule",
    position: "zeitgenosse",
    resonanzNote: "Anerkennung als Grundkategorie sozialer Beziehungen — strukturanalog zu Resonanz, aber auf intersubjektive Anerkennungsverhältnisse fokussiert.",
    keyWorks: [
      { title: "Kampf um Anerkennung", year: 1992 },
      { title: "Das Recht der Freiheit", year: 2011 },
    ],
    receives: ["hegel", "habermas"],
  },

  // ── Lebens- und Sprachphilosophie ──
  {
    id: "bergson",
    name: "Henri Bergson",
    born: 1859, died: 1941,
    tradition: "lebensphilosophie",
    position: "vorlaeufer",
    resonanzNote: "Dauer (durée) als gelebte Zeit jenseits der messbaren — Eintreten in den Strom statt Abstand zu ihm. Vorform einer nicht-distanzierten Welterfahrung.",
    keyWorks: [
      { title: "Zeit und Freiheit", year: 1889 },
      { title: "Schöpferische Evolution", year: 1907 },
    ],
    scienceLinks: ["komplexitaetstheorie"],
  },
  {
    id: "wittgenstein",
    name: "Ludwig Wittgenstein",
    born: 1889, died: 1951,
    tradition: "lebensphilosophie",
    position: "parallel",
    resonanzNote: "Sprachspiel und Lebensform — Bedeutung entsteht im Vollzug, nicht in der Definition. Verwandt mit Resonanz als nicht-objektivierender Begriff.",
    keyWorks: [
      { title: "Tractatus logico-philosophicus", year: 1921 },
      { title: "Philosophische Untersuchungen", year: 1953 },
    ],
  },

  // ── Resonanz & Beschleunigung ──
  {
    id: "taylor",
    name: "Charles Taylor",
    born: 1931,
    tradition: "resonanz",
    position: "fundament",
    resonanzNote: "Quellen des Selbst — Identität als verflochten mit moralischen Räumen. Liefert das hermeneutische Selbstverständnis, in dem Resonanz erst Sinn ergibt.",
    keyWorks: [
      { title: "Quellen des Selbst", year: 1989 },
      { title: "Ein säkulares Zeitalter", year: 2007 },
    ],
    receives: ["gadamer", "hegel"],
  },
  {
    id: "waldenfels",
    name: "Bernhard Waldenfels",
    born: 1934,
    tradition: "resonanz",
    position: "fundament",
    resonanzNote: "Responsivität: Antworten auf einen Anspruch, der dem Antwortenden vorausgeht. Kategoriale Vorbereitung des Resonanz-Begriffs.",
    keyWorks: [
      { title: "Antwortregister", year: 1994 },
      { title: "Bruchlinien der Erfahrung", year: 2002 },
    ],
    receives: ["merleau-ponty", "husserl"],
  },
  {
    id: "rosa",
    name: "Hartmut Rosa",
    born: 1965,
    tradition: "resonanz",
    position: "zeitgenosse",
    resonanzNote: "Die zentrale soziologische Stimme: Resonanz als Antwort-Verhältnis zwischen Subjekt und Welt; Beschleunigung als Resonanz-Verlust; Unverfügbarkeit als Bedingung gelingender Beziehung.",
    keyWorks: [
      { title: "Beschleunigung", year: 2005 },
      { title: "Resonanz", year: 2016 },
      { title: "Unverfügbarkeit", year: 2018 },
      { title: "Demokratie braucht Religion", year: 2022 },
    ],
    receives: ["taylor", "habermas", "waldenfels", "heidegger"],
    scienceLinks: ["beschleunigungssoziologie"],
  },
  {
    id: "reckwitz",
    name: "Andreas Reckwitz",
    born: 1970,
    tradition: "resonanz",
    position: "zeitgenosse",
    resonanzNote: "Singularitäten: das Allgemeine verliert in der Spätmoderne an Boden, das Besondere wird zur Norm. Diagnose-Komplement zu Rosas Resonanz-Pathologie.",
    keyWorks: [
      { title: "Die Gesellschaft der Singularitäten", year: 2017 },
      { title: "Das Ende der Illusionen", year: 2019 },
    ],
    receives: ["rosa", "habermas"],
  },

  // ── Wissenschaftliche Anschlüsse ──
  {
    id: "luhmann",
    name: "Niklas Luhmann",
    born: 1927, died: 1998,
    tradition: "wissenschaft",
    position: "anschluss",
    resonanzNote: "Soziale Systeme als selbstreferenzielle Kommunikationsnetze. Strukturparallele zu Resonanz: Systeme können nur resonant sein, was sie selbst zulassen.",
    keyWorks: [
      { title: "Soziale Systeme", year: 1984 },
      { title: "Die Gesellschaft der Gesellschaft", year: 1997 },
    ],
    scienceLinks: ["komplexitaetstheorie"],
  },
  {
    id: "varela",
    name: "Francisco Varela",
    born: 1946, died: 2001,
    tradition: "wissenschaft",
    position: "anschluss",
    resonanzNote: "Enaktivismus: Kognition entsteht in der Interaktion zwischen Organismus und Umwelt — direkter empirischer Andock an Merleau-Pontys Leibphänomenologie.",
    keyWorks: [
      { title: "The Embodied Mind", year: 1991 },
      { title: "Naturalizing Phenomenology", year: 1999 },
    ],
    receives: ["merleau-ponty"],
    scienceLinks: ["kognitionswissenschaft", "neurowissenschaft"],
  },
  {
    id: "prigogine",
    name: "Ilya Prigogine",
    born: 1917, died: 2003,
    tradition: "wissenschaft",
    position: "anschluss",
    resonanzNote: "Dissipative Strukturen: Selbstorganisation jenseits des Gleichgewichts. Naturwissenschaftliche Vorlage für ein Welt-Modell, in dem Resonanz emergente Ordnung stiften kann.",
    keyWorks: [
      { title: "Order Out of Chaos", year: 1984 },
      { title: "Das Ende der Gewissheiten", year: 1996 },
    ],
    scienceLinks: ["komplexitaetstheorie", "quantenphysik"],
  },
  {
    id: "damasio",
    name: "Antonio Damasio",
    born: 1944,
    tradition: "wissenschaft",
    position: "anschluss",
    resonanzNote: "Somatische Marker: Emotion und Kognition sind nicht trennbar — der Körper denkt mit. Empirischer Boden für eine Vernunft, die nicht abstrakt operiert.",
    keyWorks: [
      { title: "Descartes' Irrtum", year: 1994 },
      { title: "Im Anfang war das Gefühl", year: 2017 },
    ],
    receives: ["spinoza"],
    scienceLinks: ["neurowissenschaft", "kognitionswissenschaft"],
  },
  {
    id: "heisenberg",
    name: "Werner Heisenberg",
    born: 1901, died: 1976,
    tradition: "wissenschaft",
    position: "anschluss",
    resonanzNote: "Komplementarität und Beobachter-Effekt: in der Quantenphysik gibt es kein objektives Objekt ohne den Mess-Akt. Physikalische Spiegelung der phänomenologischen Kritik am Subjekt-Objekt-Schema.",
    keyWorks: [
      { title: "Physik und Philosophie", year: 1958 },
      { title: "Der Teil und das Ganze", year: 1969 },
    ],
    scienceLinks: ["quantenphysik"],
  },
];

// ─── Wissenschafts-Anschlüsse ────────────────────────────────────────────

export const SCIENCE_LINKS: ScienceLink[] = [
  {
    id: "kognitionswissenschaft",
    name: "Kognitionswissenschaft & verkörperte Kognition",
    description: "Bewusstsein als Vollzug zwischen Organismus und Umwelt — Enaktivismus, embodied mind. Macht aus der Phänomenologie eine empirische Forschungsrichtung.",
    exemplars: ["Francisco Varela", "Evan Thompson", "Alva Noë", "Shaun Gallagher"],
  },
  {
    id: "komplexitaetstheorie",
    name: "Komplexitätstheorie & Selbstorganisation",
    description: "Ordnung jenseits des Gleichgewichts. Liefert das mathematische Vokabular für Resonanz als emergente Beziehungs-Ordnung.",
    exemplars: ["Ilya Prigogine", "Humberto Maturana", "Francisco Varela", "Stuart Kauffman"],
  },
  {
    id: "beschleunigungssoziologie",
    name: "Beschleunigungs- & Resonanzsoziologie",
    description: "Sozialwissenschaftliche Diagnostik der Spätmoderne als Resonanzkrise. Empirische Befragung dessen, was Philosophie kategorial fasst.",
    exemplars: ["Hartmut Rosa", "Andreas Reckwitz", "Reinhart Koselleck", "Paul Virilio"],
  },
  {
    id: "neurowissenschaft",
    name: "Neurowissenschaft & Affect Theory",
    description: "Körper, Emotion und Kognition als untrennbares Geflecht — der Neurowissenschaftliche Anschluss an Spinoza und Merleau-Ponty.",
    exemplars: ["Antonio Damasio", "Joseph LeDoux", "Iain McGilchrist"],
  },
  {
    id: "quantenphysik",
    name: "Quantenphysik & Beobachter-Wirklichkeit",
    description: "Das Verschwinden des klassischen Objekts unter Messung. Physikalisches Echo der phänomenologischen Einsicht, dass Subjekt und Welt nicht trennbar sind.",
    exemplars: ["Werner Heisenberg", "Niels Bohr", "Erwin Schrödinger", "Carlo Rovelli"],
  },
];

// ─── Konzept-Tagging: Philosoph → Begriffsnetz-Knoten ──────────────────
//
// Brücke zwischen Karte und Korpus. Pro Philosoph eine kuratierte Liste
// von Konzept-IDs aus dem Begriffsnetz, mit denen dieser besonders eng
// verbunden ist. Erlaubt Cross-Link zu /resonanzen?tag=<conceptId>.
// Die Auswahl ist deutungsoffen — was die zentralen Begriffe **dieses
// Philosophen im Resonanzvernunft-Diskurs** sind, nicht eine Werkanalyse.

const CONCEPT_TAGS: Record<string, string[]> = {
  spinoza:        ["sein", "wesen", "freiheit"],
  leibniz:        ["moeglichkeit", "wirklichkeit", "echo"],
  kant:           ["vernunft", "erkenntnis", "freiheit", "denken"],
  schelling:      ["sein", "werden", "transformatives-drittes"],
  hegel:          ["vernunft", "dialog", "selbst", "andere", "ich-du"],
  husserl:        ["bewusstsein", "wesen", "erkenntnis"],
  heidegger:      ["dasein", "sein", "gelassenheit", "welt", "zeit", "öffnung"],
  "merleau-ponty": ["bewusstsein", "welt", "moment"],
  gadamer:        ["dialog", "sprache", "wahrheit"],
  ricoeur:        ["selbst", "andere", "sprache", "ich-du"],
  benjamin:       ["moment", "schatten", "echo", "lm-spiegel"],
  adorno:         ["spannung", "andere", "sprache", "schatten"],
  habermas:       ["vernunft", "dialog", "sprache"],
  honneth:        ["andere", "ich-du", "selbst"],
  bergson:        ["zeit", "moment", "werden"],
  wittgenstein:   ["sprache", "schweigen"],
  taylor:         ["selbst", "wahrheit", "freiheit"],
  waldenfels:     ["antwort", "andere", "öffnung", "stimme"],
  rosa:           ["resonanz", "resonanzvernunft", "unverfuegbarkeit", "entfremdung", "stimme"],
  reckwitz:       ["entfremdung", "spannung"],
  luhmann:        ["dazwischenintelligenz", "echo-kammer"],
  varela:         ["bewusstsein", "welt", "dasein"],
  prigogine:      ["werden", "transformatives-drittes", "moeglichkeit"],
  damasio:        ["bewusstsein"],
  heisenberg:     ["wirklichkeit", "moeglichkeit", "schatten"],
};

// Tags an die Philosophen-Objekte hängen (mutiert PHILOSOPHERS einmalig).
for (const p of PHILOSOPHERS) {
  if (CONCEPT_TAGS[p.id]) p.concepts = CONCEPT_TAGS[p.id];
}

// ─── Signatur-Phrasen für die Buch-Sicht ────────────────────────────────
//
// Pro Denker eine kurze handschriftliche Phrase — ein Zitat, eine
// Selbst-Verdichtung oder ein prägnanter Begriff. Manche paraphrasiert
// in der Stimme des Denkers, nicht alle wörtlich. Ästhetisch-treffend
// vor historisch-philologisch.

const SIGNATURE_PHRASES: Record<string, string> = {
  spinoza:        "Deus sive Natura — Gott oder die Natur.",
  leibniz:        "Die Monaden haben keine Fenster.",
  kant:           "Habe Mut, dich deines eigenen Verstandes zu bedienen.",
  schelling:      "Natur ist sichtbarer Geist.",
  hegel:          "Das Wahre ist das Ganze.",
  husserl:        "Zurück zu den Sachen selbst.",
  heidegger:      "Die Sprache ist das Haus des Seins.",
  "merleau-ponty": "Der Leib ist unser Anker in der Welt.",
  gadamer:        "Sein, das verstanden werden kann, ist Sprache.",
  ricoeur:        "Sich selbst als ein Anderer.",
  benjamin:       "Aura — Erscheinung einer Ferne, so nah sie sein mag.",
  adorno:         "Das Ganze ist das Unwahre.",
  habermas:       "Vernunft im verständigungsorientierten Sprechen.",
  honneth:        "Anerkennung als Bedingung gelingenden Selbstseins.",
  bergson:        "Dauer ist gelebte Zeit, kein Container.",
  wittgenstein:   "Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.",
  taylor:         "Wir sind, was uns wichtig ist.",
  waldenfels:     "Ich antworte, also bin ich.",
  rosa:           "Resonanz ist kein Echo — sie ist Antwort.",
  reckwitz:       "Singularität ist die Norm der Spätmoderne.",
  luhmann:        "Was wir wissen, wissen wir durch Medien.",
  varela:         "Mind in Life — der Geist beginnt mit dem Stoffwechsel.",
  prigogine:      "Ordnung entsteht aus dem Fließen, nicht aus dem Stillstand.",
  damasio:        "Das somatische Selbst kommt vor dem reflektierenden.",
  heisenberg:     "Wir beobachten nicht die Natur selbst — sondern Natur, die unserer Frage ausgesetzt ist.",
};

for (const p of PHILOSOPHERS) {
  if (SIGNATURE_PHRASES[p.id]) p.signaturePhrase = SIGNATURE_PHRASES[p.id];
}

// ─── Resonanzvernunft-Pfad — die Erzählung ──────────────────────────────

/**
 * Hervorgehobener Pfad durch die Karte: jene Linie, auf die sich
 * Resonanzvernunft am direktesten zurückführen lässt. Die Auswahl
 * ist deutungsoffen, nicht abschließend.
 */
export const RESONANZVERNUNFT_PFAD: string[] = [
  "spinoza", "schelling", "hegel", "heidegger", "merleau-ponty",
  "gadamer", "waldenfels", "rosa",
];

// ─── Helpers ──────────────────────────────────────────────────────────────

export function getPhilosopher(id: string): Philosopher | undefined {
  return PHILOSOPHERS.find(p => p.id === id);
}

export function getTradition(id: TraditionId): Tradition | undefined {
  return TRADITIONS.find(t => t.id === id);
}

export function getScienceLink(id: ScienceLinkId): ScienceLink | undefined {
  return SCIENCE_LINKS.find(s => s.id === id);
}

/** Sortiert Philosophen chronologisch nach Geburtsjahr. */
export function philosophersByBirth(): Philosopher[] {
  return [...PHILOSOPHERS].sort((a, b) => a.born - b.born);
}

export const POSITION_LABEL: Record<Position, string> = {
  "fundament":   "Fundament",
  "vorlaeufer":  "Vorläufer",
  "kritik":      "kritischer Bezug",
  "zeitgenosse": "Zeitgenosse",
  "anschluss":   "wiss. Anschluss",
  "parallel":    "parallel",
};
