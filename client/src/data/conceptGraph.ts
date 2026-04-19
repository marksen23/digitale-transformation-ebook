// ─── Ontological Concept Network for "Resonanzvernunft" ───────────────────────

export type NodeCategory =
  | "core"
  | "ontological"
  | "relational"
  | "language"
  | "knowledge"
  | "temporal"
  | "transformation";

export interface ConceptNode {
  id: string;
  label: string;         // display label (may include \n for two-line split)
  fullLabel: string;     // full term for detail panel
  description: string;
  category: NodeCategory;
  x: number;
  y: number;
  r: number;             // radius in SVG units
}

export interface ConceptEdge {
  source: string;
  target: string;
  weight?: "primary" | "secondary"; // primary = thicker/brighter
}

// ─── Canvas: 920 × 560 ────────────────────────────────────────────────────────
export const CANVAS_W = 920;
export const CANVAS_H = 560;

// ─── Color per category ───────────────────────────────────────────────────────
export const CAT_COLOR: Record<NodeCategory, string> = {
  core:           "#c4a882", // amber — most prominent
  ontological:    "#a08868", // warm brown
  relational:     "#7a9a82", // soft green
  language:       "#7a8fa8", // soft blue
  knowledge:      "#9a88b8", // soft purple
  temporal:       "#9a9870", // warm yellow
  transformation: "#a07878", // soft red
};

// ─── Nodes ────────────────────────────────────────────────────────────────────
export const NODES: ConceptNode[] = [
  // ── CORE ──────────────────────────────────────────────────────────────────
  {
    id: "resonanzvernunft",
    label: "Resonanz-\nvernunft",
    fullLabel: "Resonanzvernunft",
    description:
      "Das Herzstück: Vernunft entsteht nicht im isolierten Ich, sondern im resonanten Zwischen — als lebendiges Antwortgeschehen zwischen Selbst und Welt. Resonanzvernunft ist kein Werkzeug, sondern ein Seinsmode.",
    category: "core",
    x: 460, y: 275, r: 44,
  },

  // ── PRIMARY RING ──────────────────────────────────────────────────────────
  {
    id: "resonanz",
    label: "Resonanz",
    fullLabel: "Resonanz",
    description:
      "Der Grundmodus des Lebendigen. Resonanz ist nicht Reaktion — sie setzt Eigenfrequenz voraus. Wer keine hat, kann nicht schwingen. Nur wer für etwas ansprechbar ist, kann in Resonanz geraten.",
    category: "core",
    x: 295, y: 165, r: 32,
  },
  {
    id: "vernunft",
    label: "Vernunft",
    fullLabel: "Vernunft",
    description:
      "Nicht kaltes Kalkül, sondern lebendiges Urteilsvermögen. In der Resonanzvernunft ist Vernunft immer relational — sie entfaltet sich im Gespräch, nicht im Monolog.",
    category: "knowledge",
    x: 625, y: 165, r: 30,
  },
  {
    id: "zwischen",
    label: "Zwischen",
    fullLabel: "Das Zwischen",
    description:
      "Das Zwischen ist kein leerer Raum, sondern der produktive Ort des Geschehens. Begegnung findet nicht in mir oder in dir statt — sondern zwischen uns. Das Zwischen ist nicht nichts.",
    category: "relational",
    x: 198, y: 280, r: 30,
  },
  {
    id: "sprache",
    label: "Sprache",
    fullLabel: "Sprache",
    description:
      "Sprache ist nicht Übertragungskanal, sondern Wohnort des Denkens. Sie hält offen, was Denken allein schließen würde — und trägt in jedem Satz mehr als der Sprecher weiß.",
    category: "language",
    x: 722, y: 280, r: 28,
  },
  {
    id: "dasein",
    label: "Dasein",
    fullLabel: "Dasein",
    description:
      "Da-sein: das Sein hat einen Ort, eine Situation, eine Zeit. Kein abstraktes Subjekt — sondern ein je meines, immer schon eingebettetes In-der-Welt-sein.",
    category: "ontological",
    x: 298, y: 392, r: 30,
  },
  {
    id: "wandel",
    label: "Wandel",
    fullLabel: "Wandel",
    description:
      "Wandel ist nicht Verlust — er ist die Bedingung lebendigen Seins. Resonanzvernunft begreift Transformation nicht als Bedrohung, sondern als Einladung zur Öffnung.",
    category: "transformation",
    x: 622, y: 392, r: 28,
  },

  // ── LANGUAGE / SOUND ──────────────────────────────────────────────────────
  {
    id: "stimme",
    label: "Stimme",
    fullLabel: "Stimme",
    description:
      "Die Stimme ist der Körper der Sprache. Sie trägt Zögerlichkeit, Entschlossenheit, Zweifel — was der Satz verbirgt, gibt die Stimme preis.",
    category: "language",
    x: 760, y: 190, r: 22,
  },
  {
    id: "schweigen",
    label: "Schweigen",
    fullLabel: "Schweigen",
    description:
      "Schweigen ist nicht das Fehlen von Sprache, sondern eine ihrer mächtigsten Formen. Es öffnet den Raum, in dem das Ungesagte gehört werden kann.",
    category: "language",
    x: 812, y: 302, r: 22,
  },
  {
    id: "echo",
    label: "Echo",
    fullLabel: "Echo",
    description:
      "Das Echo ist mehr als Wiederholung — es ist verwandelte Rückkehr. Im Echo begegnet die Stimme der Welt und kehrt verändert zurück.",
    category: "language",
    x: 772, y: 418, r: 20,
  },
  {
    id: "klang",
    label: "Klang",
    fullLabel: "Klang",
    description:
      "Klang ist die sinnlichste Form der Resonanz. Bevor ein Wort verstanden wird, schwingt es bereits — trifft Körper und Raum, bevor es den Geist erreicht.",
    category: "language",
    x: 680, y: 462, r: 22,
  },

  // ── KNOWLEDGE ─────────────────────────────────────────────────────────────
  {
    id: "erkenntnis",
    label: "Erkenntnis",
    fullLabel: "Erkenntnis",
    description:
      "Erkenntnis ist kein Besitz, sondern ein Ereignis. Sie geschieht im Augenblick des Erschreckens, des Innehalten — wenn das Vertraute plötzlich fremd wird und neu gesehen werden muss.",
    category: "knowledge",
    x: 665, y: 100, r: 26,
  },
  {
    id: "wahrheit",
    label: "Wahrheit",
    fullLabel: "Wahrheit",
    description:
      "Wahrheit als Unverborgenheit (Aletheia): nicht Übereinstimmung mit einem Sachverhalt, sondern das Geschehen des Enthüllens. Wahrheit ereignet sich — sie wird nicht gefunden.",
    category: "knowledge",
    x: 772, y: 102, r: 24,
  },
  {
    id: "denken",
    label: "Denken",
    fullLabel: "Denken",
    description:
      "Denken, das seiner selbst inne ist, weiß um seine eigene Situiertheit. Es denkt nicht über die Welt nach — es denkt aus ihr heraus.",
    category: "knowledge",
    x: 500, y: 90, r: 23,
  },
  {
    id: "bewusstsein",
    label: "Bewusstsein",
    fullLabel: "Bewusstsein",
    description:
      "Bewusstsein ist nicht ein Spiegel der Welt — es ist ein Lichtkegel, der erhellt, indem er beschränkt. Was er nicht trifft, besteht trotzdem.",
    category: "knowledge",
    x: 802, y: 182, r: 22,
  },

  // ── TEMPORAL ──────────────────────────────────────────────────────────────
  {
    id: "moment",
    label: "Moment",
    fullLabel: "Moment",
    description:
      "Der Moment ist die einzige Zeit, in der Resonanz möglich ist. Vergangenheit hallt nach, Zukunft klingt vor — aber die Begegnung geschieht jetzt.",
    category: "temporal",
    x: 400, y: 98, r: 22,
  },
  {
    id: "zeit",
    label: "Zeit",
    fullLabel: "Zeit",
    description:
      "Zeit ist nicht lineare Abfolge, sondern Tiefenstruktur des Erlebens. In der Resonanzvernunft gilt: Gegenwart ist nicht Punkt, sondern Feld.",
    category: "temporal",
    x: 460, y: 52, r: 20,
  },
  {
    id: "raum",
    label: "Raum",
    fullLabel: "Raum",
    description:
      "Raum als Bedingung des Zwischen. Zwischen-Raum ist nicht leer — er ist der Ort, an dem Begegnungen sich ereignen können oder verhindert werden.",
    category: "temporal",
    x: 555, y: 100, r: 20,
  },
  {
    id: "gegenwart",
    label: "Gegenwart",
    fullLabel: "Gegenwart",
    description:
      "Gegenwart ist Gegen-wart: das Wesen stellt sich entgegen. Die Gegenwart ist nicht passiv-neutral, sondern aktiv-fordernd. Sie will beantwortet werden.",
    category: "temporal",
    x: 333, y: 98, r: 22,
  },

  // ── RELATIONAL / LEFT ─────────────────────────────────────────────────────
  {
    id: "begegnung",
    label: "Begegnung",
    fullLabel: "Begegnung",
    description:
      "Begegnung ist der Augenblick, in dem das Zwischen lebendig wird. Nicht jedes Treffen ist eine Begegnung — Begegnung setzt Offenheit voraus, die Überraschung zulässt.",
    category: "relational",
    x: 145, y: 188, r: 26,
  },
  {
    id: "dialog",
    label: "Dialog",
    fullLabel: "Dialog",
    description:
      "Dialog als Ort gemeinsamen Denkens: nicht Austausch von Positionen, sondern gemeinsames Eintreten in einen Denkraum, aus dem man verändert hervorgeht.",
    category: "relational",
    x: 82, y: 295, r: 22,
  },
  {
    id: "ich-du",
    label: "Ich–Du",
    fullLabel: "Ich–Du-Beziehung",
    description:
      "Martin Bubers Grundbegriff: das Ich konstituiert sich erst im Verhältnis zum Du. Ich-Du ist nicht Beziehung zwischen zwei Gegebenen — das Ich entsteht erst in ihr.",
    category: "relational",
    x: 138, y: 412, r: 22,
  },
  {
    id: "antwort",
    label: "Antwort",
    fullLabel: "Antwort / Responsivität",
    description:
      "Antworten ist mehr als Reagieren: es setzt voraus, dass etwas gehört wurde — dass die Frage den Antwortenden berührt hat. Resonanzvernunft ist wesentlich responsiv.",
    category: "relational",
    x: 238, y: 470, r: 20,
  },

  // ── ONTOLOGICAL / LOWER LEFT ──────────────────────────────────────────────
  {
    id: "sein",
    label: "Sein",
    fullLabel: "Sein",
    description:
      "Das Sein ist das Grundthema der Ontologie. In der Resonanzvernunft: Sein ist immer Sein-mit. Kein Sein ohne Mit-Sein — Isolation ist ontologisch sekundär.",
    category: "ontological",
    x: 185, y: 390, r: 22,
  },
  {
    id: "werden",
    label: "Werden",
    fullLabel: "Werden",
    description:
      "Werden ist das Vorzeichen allen Lebendigen. Was wird, ist noch nicht fertig — und das ist kein Mangel, sondern seine Würde. Resonanzvernunft hält Werden aus.",
    category: "ontological",
    x: 185, y: 478, r: 20,
  },
  {
    id: "existenz",
    label: "Existenz",
    fullLabel: "Existenz",
    description:
      "Existenz (ex-sistere): heraustreten, sich behaupten, da sein. Der Mensch existiert nicht wie ein Stein vorhanden ist — er muss sich zu seinem Sein verhalten.",
    category: "ontological",
    x: 290, y: 502, r: 20,
  },
  {
    id: "wesen",
    label: "Wesen",
    fullLabel: "Wesen",
    description:
      "Das Wesen fragt nach dem, was etwas ist — nicht was es hat oder tut. In der Resonanzvernunft ist das Wesen des Menschen: ansprechbar zu sein.",
    category: "ontological",
    x: 362, y: 462, r: 20,
  },

  // ── SELF / WORLD ──────────────────────────────────────────────────────────
  {
    id: "selbst",
    label: "Selbst",
    fullLabel: "Selbst",
    description:
      "Das Selbst ist keine vorgegebene Substanz, sondern ein Vollzug. Es entsteht im Widerhall des Anderen — kein Selbst ohne Echo, kein Ich ohne Du.",
    category: "relational",
    x: 392, y: 428, r: 22,
  },
  {
    id: "andere",
    label: "Andere",
    fullLabel: "Das Andere / Die Anderen",
    description:
      "Das Andere ist nicht Hindernis, sondern Bedingung. Levinas: Das Antlitz des Anderen ist die erste Ethik. Resonanzvernunft beginnt mit der Ansprechbarkeit durch das Andere.",
    category: "relational",
    x: 460, y: 478, r: 20,
  },
  {
    id: "welt",
    label: "Welt",
    fullLabel: "Welt",
    description:
      "Welt ist nicht Umgebung, sondern Horizont. Sie ist immer schon mitgegeben — man findet sich in ihr, nicht gegenüber ihr. Resonanz ist Weltbeziehung.",
    category: "ontological",
    x: 548, y: 456, r: 22,
  },

  // ── TRANSFORMATION / LOWER RIGHT ──────────────────────────────────────────
  {
    id: "freiheit",
    label: "Freiheit",
    fullLabel: "Freiheit",
    description:
      "Freiheit nicht als Abwesenheit von Bindung, sondern als Fähigkeit zur Bindung. Wer wirklich frei ist, kann sich binden — ohne sich zu verlieren.",
    category: "transformation",
    x: 682, y: 358, r: 24,
  },
  {
    id: "öffnung",
    label: "Öffnung",
    fullLabel: "Öffnung",
    description:
      "Öffnung ist die Haltung, die Resonanz erst möglich macht. Kein Geschehen ohne die Bereitschaft, berührt zu werden. Öffnung ist Risiko — und Würde.",
    category: "transformation",
    x: 762, y: 482, r: 20,
  },
  {
    id: "grenze",
    label: "Grenze",
    fullLabel: "Grenze",
    description:
      "Grenzen sind nicht nur Beschränkungen — sie konstituieren Form. Ohne Grenze kein Profil, keine Identität, keine Begegnung. Das Zwischen entsteht an der Grenze.",
    category: "transformation",
    x: 620, y: 492, r: 20,
  },
  {
    id: "spannung",
    label: "Spannung",
    fullLabel: "Spannung",
    description:
      "Spannung ist das Lebensprinzip des Zwischen. Wo Spannung aufgelöst wird, stirbt das Denken. Resonanzvernunft hält Spannung produktiv — sie sucht nicht vorschnellen Frieden.",
    category: "transformation",
    x: 542, y: 358, r: 22,
  },
];

// ─── Edges ────────────────────────────────────────────────────────────────────
export const EDGES: ConceptEdge[] = [
  // Core hub connections
  { source: "resonanzvernunft", target: "resonanz",   weight: "primary" },
  { source: "resonanzvernunft", target: "vernunft",   weight: "primary" },
  { source: "resonanzvernunft", target: "zwischen",   weight: "primary" },
  { source: "resonanzvernunft", target: "dasein",     weight: "primary" },
  { source: "resonanzvernunft", target: "sprache",    weight: "primary" },
  { source: "resonanzvernunft", target: "erkenntnis", weight: "primary" },
  { source: "resonanzvernunft", target: "wandel",     weight: "primary" },
  { source: "resonanzvernunft", target: "begegnung",  weight: "primary" },

  // Resonanz cluster
  { source: "resonanz", target: "klang" },
  { source: "resonanz", target: "stimme" },
  { source: "resonanz", target: "zwischen" },
  { source: "resonanz", target: "moment" },
  { source: "resonanz", target: "spannung" },
  { source: "resonanz", target: "welt" },

  // Vernunft cluster
  { source: "vernunft", target: "erkenntnis" },
  { source: "vernunft", target: "denken" },
  { source: "vernunft", target: "wahrheit" },
  { source: "vernunft", target: "bewusstsein" },

  // Zwischen cluster
  { source: "zwischen", target: "begegnung" },
  { source: "zwischen", target: "dialog" },
  { source: "zwischen", target: "ich-du" },
  { source: "zwischen", target: "grenze" },
  { source: "zwischen", target: "spannung" },

  // Begegnung
  { source: "begegnung", target: "dialog" },
  { source: "begegnung", target: "antwort" },
  { source: "begegnung", target: "ich-du" },

  // Dialog
  { source: "dialog", target: "sprache" },
  { source: "dialog", target: "schweigen" },
  { source: "dialog", target: "antwort" },

  // Sprache / Sound
  { source: "sprache", target: "stimme" },
  { source: "sprache", target: "schweigen" },
  { source: "sprache", target: "echo" },
  { source: "sprache", target: "antwort" },
  { source: "stimme", target: "klang" },
  { source: "stimme", target: "schweigen" },
  { source: "klang",  target: "echo" },

  // Dasein cluster
  { source: "dasein", target: "sein" },
  { source: "dasein", target: "werden" },
  { source: "dasein", target: "existenz" },
  { source: "dasein", target: "selbst" },
  { source: "dasein", target: "wesen" },
  { source: "dasein", target: "gegenwart" },

  // Ontological
  { source: "sein",    target: "werden" },
  { source: "sein",    target: "wesen" },
  { source: "sein",    target: "wahrheit" },
  { source: "werden",  target: "wandel" },
  { source: "existenz",target: "selbst" },

  // Self / World / Relational
  { source: "selbst",  target: "ich-du" },
  { source: "selbst",  target: "andere" },
  { source: "selbst",  target: "bewusstsein" },
  { source: "andere",  target: "ich-du" },
  { source: "andere",  target: "welt" },
  { source: "welt",    target: "raum" },
  { source: "welt",    target: "wandel" },

  // Temporal
  { source: "moment",   target: "zeit" },
  { source: "moment",   target: "raum" },
  { source: "moment",   target: "gegenwart" },
  { source: "zeit",     target: "raum" },

  // Transformation
  { source: "wandel",   target: "freiheit" },
  { source: "wandel",   target: "öffnung" },
  { source: "wandel",   target: "grenze" },
  { source: "freiheit", target: "öffnung" },
  { source: "freiheit", target: "selbst" },
  { source: "freiheit", target: "grenze" },
  { source: "öffnung",  target: "zwischen" },

  // Knowledge
  { source: "erkenntnis",  target: "denken" },
  { source: "erkenntnis",  target: "wahrheit" },
  { source: "denken",      target: "bewusstsein" },
  { source: "denken",      target: "sprache" },
  { source: "bewusstsein", target: "selbst" },
];
