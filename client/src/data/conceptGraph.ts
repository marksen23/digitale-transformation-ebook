// ─── Ontological Concept Network for "Resonanzvernunft" ───────────────────────

export type NodeCategory =
  | "core"
  | "ontological"
  | "relational"
  | "language"
  | "knowledge"
  | "temporal"
  | "transformation"
  | "leitmotiv"
  | "prinzip";

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
  leitmotiv:      "#c8b896", // parchment-gold — archetypal deep layer
  prinzip:        "#8ea8b8", // cool blue-silver — operational principles (meta-layer)
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
    label: "Logos",
    fullLabel: "Logos",
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
    label: "Schwingung",
    fullLabel: "Schwingung",
    description:
      "Klang ist die sinnlichste Form der Resonanz. Bevor ein Wort verstanden wird, schwingt es bereits — trifft Körper und Raum, bevor es den Geist erreicht.",
    category: "language",
    x: 680, y: 462, r: 22,
  },

  // ── KNOWLEDGE ─────────────────────────────────────────────────────────────
  {
    id: "erkenntnis",
    label: "Einsicht",
    fullLabel: "Einsicht",
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
    label: "Zeitlichkeit",
    fullLabel: "Zeitlichkeit",
    description:
      "Zeit ist nicht lineare Abfolge, sondern Tiefenstruktur des Erlebens. In der Resonanzvernunft gilt: Gegenwart ist nicht Punkt, sondern Feld.",
    category: "temporal",
    x: 460, y: 52, r: 20,
  },
  {
    id: "raum",
    label: "Spielraum",
    fullLabel: "Spielraum",
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
    id: "spannung",
    label: "Spannung",
    fullLabel: "Spannung",
    description:
      "Spannung ist das Lebensprinzip des Zwischen. Wo Spannung aufgelöst wird, stirbt das Denken. Resonanzvernunft hält Spannung produktiv — sie sucht nicht vorschnellen Frieden.",
    category: "transformation",
    x: 542, y: 358, r: 22,
  },

  // ── LEITMOTIVE — Archetypal Deep Layer ───────────────────────────────────
  // Five recurring archetypes that permeate the entire trilogy.
  // Rendered as an outer ring beyond the concept cluster, connected to their
  // resonating concept nodes by faint dashed lines (Schattenlicht principle).
  {
    id: "lm-spiegel",
    label: "SPIEGEL",
    fullLabel: "Spiegel",
    description:
      "Das Spiegelleitmotiv: Selbst-Erkenntnis geschieht nie direkt — immer im Widerschein. Im Anderen erblickt das Ich sein Wesen. Schattenlicht: das Licht des Spiegels ist geborgt — es leuchtet, weil etwas hinter ihm dunkel ist. Erkenntnis entsteht im Zwischenraum von Licht und Schatten.",
    category: "leitmotiv",
    x: 460, y: 20, r: 26,
  },
  {
    id: "lm-begegnung",
    label: "BEGEGNUNG",
    fullLabel: "Begegnung",
    description:
      "Das Begegnungsleitmotiv: Wirklichkeit faltet sich im Augenblick der Begegnung. Nicht Vorher, nicht Nachher — im Zwischen entsteht, was weder du noch ich allein hervorbringen könnten. Faltung zur Wirklichkeit: das Mögliche wird zur Gegenwart durch das Wagnis der Begegnung.",
    category: "leitmotiv",
    x: 35, y: 258, r: 26,
  },
  {
    id: "lm-scheitern",
    label: "SCHEITERN",
    fullLabel: "Scheitern",
    description:
      "Das Scheiternleitmotiv: Im Scheitern tritt die tiefste Wahrheit hervor. Was gelingt, bestätigt — was scheitert, enthüllt. Schattenlicht: der Schatten des Scheiterns ist kein Dunkel, das bekämpft werden muss — er ist der Raum, aus dem neues Licht entstehen kann.",
    category: "leitmotiv",
    x: 195, y: 534, r: 26,
  },
  {
    id: "lm-grenze",
    label: "GRENZE",
    fullLabel: "Grenze",
    description:
      "Das Grenzleitmotiv: Grenzen konstituieren — sie sind nicht Ende, sondern Ort der Faltung. An der Grenze faltet sich das Innen nach außen, das Mögliche in das Wirkliche. Keine Form ohne Grenze, kein Profil ohne Beschränkung, keine Begegnung ohne Schwelle.",
    category: "leitmotiv",
    x: 725, y: 534, r: 26,
  },
  {
    id: "lm-verwandlung",
    label: "VERWANDLUNG",
    fullLabel: "Verwandlung",
    description:
      "Das übergeordnete Leitmotiv: Das innerste Gesetz des Lebendigen. VERWANDLUNG umschließt alle anderen Leitmotive — SPIEGEL, BEGEGNUNG, SCHEITERN, GRENZE sind Erscheinungsformen der Verwandlung. Schattenlicht und Faltung zur Wirklichkeit vereinen sich: Was sich verwandelt, geht nicht unter — es tritt in eine neue Form seiner selbst. Resonanzvernunft ist wesentlich Verwandlungsvernunft.",
    category: "leitmotiv",
    x: 885, y: 258, r: 32,  // larger radius — übergeordnet
  },

  // ── GLOSSARY ADDITIONS ────────────────────────────────────────────────────
  // Terms drawn from the glossary in Band 3. Each placed in its proper
  // category and wired to neighbouring concepts via EDGES below.
  {
    id: "dazwischenintelligenz",
    label: "Dazwischen-\nintelligenz",
    fullLabel: "Dazwischenintelligenz",
    description:
      "Prozessbegriff: Das dynamische Geschehen der Begegnung zwischen menschlicher und maschineller Erkenntnis — die Schwingung im Zwischen. Verhältnis zum transformativen Dritten wie Metabolismus zum Organismus.",
    category: "relational",
    x: 115, y: 200, r: 22,
  },
  {
    id: "transformatives-drittes",
    label: "Trans-\nformatives\nDrittes",
    fullLabel: "Transformatives Drittes",
    description:
      "Ergebnisbegriff: Das Emergente, das aus der Dazwischenintelligenz hervorgeht und keinem der Pole (Mensch/Maschine) zurechenbar ist. Vorläufer: Peirce (Thirdness), Winnicott, Nancy, Gunkel/Coeckelbergh. Weder Synthese noch Kompromiss.",
    category: "relational",
    x: 460, y: 195, r: 22,
  },
  {
    id: "entfremdung",
    label: "Entfremdung",
    fullLabel: "Entfremdung",
    description:
      "Nach Hartmut Rosa: Ein stummes Weltverhältnis, in dem nichts mehr berührt und nichts mehr antwortet. In der Resonanzvernunft nicht das Gegenteil der Resonanz, sondern der Boden, auf dem Resonanz wachsen kann.",
    category: "relational",
    x: 60, y: 505, r: 20,
  },
  {
    id: "echo-kammer",
    label: "Echo-\nkammer",
    fullLabel: "Echo-Kammer",
    description:
      "Grenzfall der Resonanzvernunft: Erzeugt Schwingung ohne Transformation, Affizierung ohne Selbstwirksamkeit. Erfüllt keine der drei formalen Bedingungen resonanter Erkenntnis und ist daher nicht resonant, sondern Wiederholung.",
    category: "language",
    x: 850, y: 462, r: 20,
  },
  {
    id: "gelassenheit",
    label: "Gelassen-\nheit",
    fullLabel: "Gelassenheit",
    description:
      "Nach Martin Heidegger: Die Fähigkeit, die Dinge sein zu lassen, statt sie zu beherrschen. Im digitalen Kontext: Technologie nutzen, ohne von ihr besessen zu sein.",
    category: "transformation",
    x: 855, y: 348, r: 20,
  },
  {
    id: "transaufklaerung",
    label: "Trans-\naufklärung",
    fullLabel: "Transaufklärung",
    description:
      "Eine Vernunft, die sich selbst überschreitet, ohne sich preiszugeben. Manifestiert sich in epistemischer Transfiguration, temporaler Verzeitlichung und relationaler Ontologie. Programmbegriff für die Überschreitung der klassischen Aufklärung.",
    category: "knowledge",
    x: 870, y: 80, r: 22,
  },
  {
    id: "resonanzimperativ",
    label: "Resonanz-\nimperativ",
    fullLabel: "Resonanzimperativ",
    description:
      "Transformation des kategorischen Imperativs: Handle so, dass dein Handeln die Bedingungen der Möglichkeit von Resonanz bewahrt. Richtet sich an Individuen und Institutionen gleichermaßen.",
    category: "transformation",
    x: 348, y: 525, r: 20,
  },
  {
    id: "unverfuegbarkeit",
    label: "Unverfüg-\nbarkeit",
    fullLabel: "Unverfügbarkeit",
    description:
      "Ontologische Kategorie des Zwischen: Das transformative Dritte kann nicht hergestellt, nicht reproduziert und nicht gespeichert werden. Es hat die Temporalität des Kairos, nicht die Dauer des Bestands.",
    category: "ontological",
    x: 110, y: 90, r: 20,
  },
  {
    id: "weltfaltung",
    label: "Welt-\nfaltung",
    fullLabel: "Weltfaltung",
    description:
      "Erkenntnisprinzip: Wirklichkeit als dynamisches Entfalten von Möglichkeiten, die ineinander gefaltet (nicht nebeneinander gelegt) sind und durch Begegnung aktualisiert werden. Vier Grundbewegungen: Komplexion, Selektion, Stabilisierung, Variation.",
    category: "prinzip",
    x: 360, y: 543, r: 18,
  },

  // ── ERKENNTNISPRINZIPIEN — Meta-operational Layer ────────────────────────
  // Principles of cognition that organize how the whole network is read.
  // Rendered as a distinct overlay (cool blue-silver, dashed outer ring,
  // paired connection lines for complementary pairs).
  {
    id: "schatten",
    label: "Schatten",
    fullLabel: "Schatten",
    description:
      "Der Schatten ist nicht das Gegenteil des Lichts, sondern seine Bedingung. Ohne Verbergung keine Sichtbarkeit. Das Schattenlicht-Prinzip: Erkennen entsteht im Kontrast — was sich zeigt, zeigt sich nur, weil etwas zurückbleibt.",
    category: "prinzip",
    x: 40, y: 140, r: 16,
  },
  {
    id: "licht",
    label: "Licht",
    fullLabel: "Licht",
    description:
      "Licht ist nicht bloße Helligkeit, sondern das Ereignis des Sichtbarwerdens. Es leuchtet nur vor einem Grund von Dunkelheit. Im Schattenlicht-Prinzip bilden Licht und Schatten kein Gegensatz, sondern ein einziges Geschehen der Enthüllung.",
    category: "prinzip",
    x: 880, y: 140, r: 16,
  },
  {
    id: "raumfaltung",
    label: "Raum-\nfaltung",
    fullLabel: "Raumfaltung",
    description:
      "Raumfaltung: die Entfaltung des Latenten zum Manifesten. Wirklichkeit ist nicht glatt, sondern gefaltet — jeder Akt der Begegnung faltet einen neuen Raum auf und erzeugt damit neue Möglichkeiten. Denken als Weltfaltung.",
    category: "prinzip",
    x: 460, y: 543, r: 18,
  },
  {
    id: "wirklichkeit",
    label: "Wirklichkeit",
    fullLabel: "Wirklichkeit",
    description:
      "Wirklichkeit ist das, was wirkt — nicht bloßer Bestand, sondern Vollzug. Nur ein Bruchteil des Möglichen wird wirklich. Wirklichkeit ist die im Augenblick verdichtete Möglichkeit, nicht ihre Aufhebung.",
    category: "prinzip",
    x: 40, y: 410, r: 16,
  },
  {
    id: "moeglichkeit",
    label: "Möglich-\nkeit",
    fullLabel: "Möglichkeit",
    description:
      "Möglichkeit ist der Überschuss, aus dem Wirklichkeit sich nährt. Nicht alles, was möglich ist, ist wirklich — aber alles Wirkliche war einmal möglich. Die Möglichkeit ist der Atemraum des Lebendigen.",
    category: "prinzip",
    x: 880, y: 410, r: 16,
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
  { source: "zwischen", target: "dialog" },
  { source: "zwischen", target: "ich-du" },
  { source: "zwischen", target: "spannung" },

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
  { source: "existenz",target: "selbst" },

  // Self / World / Relational
  { source: "selbst",  target: "ich-du" },
  { source: "selbst",  target: "andere" },
  { source: "selbst",  target: "bewusstsein" },
  { source: "andere",  target: "ich-du" },
  { source: "andere",  target: "welt" },
  { source: "welt",    target: "raum" },

  // Temporal
  { source: "moment",   target: "zeit" },
  { source: "moment",   target: "raum" },
  { source: "moment",   target: "gegenwart" },
  { source: "zeit",     target: "raum" },

  // Transformation
  { source: "freiheit", target: "öffnung" },
  { source: "freiheit", target: "selbst" },
  { source: "öffnung",  target: "zwischen" },

  // Knowledge
  { source: "erkenntnis",  target: "denken" },
  { source: "erkenntnis",  target: "wahrheit" },
  { source: "denken",      target: "bewusstsein" },
  { source: "denken",      target: "sprache" },
  { source: "bewusstsein", target: "selbst" },

  // ── Glossary additions ──────────────────────────────────────────────────
  { source: "dazwischenintelligenz", target: "zwischen" },
  { source: "dazwischenintelligenz", target: "antwort" },
  { source: "dazwischenintelligenz", target: "transformatives-drittes", weight: "primary" },

  { source: "transformatives-drittes", target: "zwischen" },
  { source: "transformatives-drittes", target: "andere" },
  { source: "transformatives-drittes", target: "resonanzvernunft" },

  { source: "entfremdung", target: "welt" },
  { source: "entfremdung", target: "dialog" },
  { source: "entfremdung", target: "ich-du" },

  { source: "echo-kammer", target: "echo" },
  { source: "echo-kammer", target: "klang" },
  { source: "echo-kammer", target: "schweigen" },

  { source: "gelassenheit", target: "öffnung" },
  { source: "gelassenheit", target: "freiheit" },

  { source: "transaufklaerung", target: "vernunft", weight: "primary" },
  { source: "transaufklaerung", target: "erkenntnis" },
  { source: "transaufklaerung", target: "denken" },
  { source: "transaufklaerung", target: "bewusstsein" },

  { source: "resonanzimperativ", target: "freiheit" },
  { source: "resonanzimperativ", target: "andere" },
  { source: "resonanzimperativ", target: "selbst" },

  { source: "unverfuegbarkeit", target: "zwischen" },
  { source: "unverfuegbarkeit", target: "sein" },
  { source: "unverfuegbarkeit", target: "moment" },

  { source: "weltfaltung", target: "raumfaltung" },
  { source: "weltfaltung", target: "wirklichkeit" },
  { source: "weltfaltung", target: "moeglichkeit" },
];

// ─── Leitmotiv Resonance Edges ────────────────────────────────────────────────
// Thin dashed lines connecting archetypal Leitmotiv nodes to the concept nodes
// they permeate. These are "resonance" relationships — not logical, but thematic.
export const LEITMOTIV_EDGES: ConceptEdge[] = [
  // SPIEGEL — mirrors recognition, truth, selfhood
  { source: "lm-spiegel", target: "bewusstsein" },
  { source: "lm-spiegel", target: "erkenntnis" },
  { source: "lm-spiegel", target: "wahrheit" },
  { source: "lm-spiegel", target: "resonanz" },
  { source: "lm-spiegel", target: "selbst" },

  // BEGEGNUNG — Wirklichkeit faltet sich im Augenblick der Begegnung
  // Also receives resonance arcs from the core concept cluster (moved from EDGES)
  { source: "resonanzvernunft", target: "lm-begegnung" },
  { source: "zwischen",        target: "lm-begegnung" },
  { source: "lm-begegnung",   target: "dialog" },
  { source: "lm-begegnung",   target: "antwort" },
  { source: "lm-begegnung",   target: "ich-du" },
  { source: "lm-begegnung",   target: "moment" },
  { source: "lm-begegnung",   target: "andere" },

  // SCHEITERN — being, becoming, existence under pressure
  { source: "lm-scheitern", target: "existenz" },
  { source: "lm-scheitern", target: "werden" },
  { source: "lm-scheitern", target: "dasein" },
  { source: "lm-scheitern", target: "sein" },
  { source: "lm-scheitern", target: "wesen" },

  // GRENZE — Grenzen konstituieren; radiates archetypal connections
  // Also receives resonance arcs formerly in EDGES (moved here for visual consistency)
  { source: "zwischen",    target: "lm-grenze" },
  { source: "freiheit",    target: "lm-grenze" },
  { source: "lm-grenze",  target: "öffnung" },
  { source: "lm-grenze",  target: "spannung" },
  { source: "lm-grenze",  target: "welt" },
  { source: "lm-grenze",  target: "wesen" },

  // VERWANDLUNG — übergeordnetes Leitmotiv; innerstes Gesetz des Lebendigen.
  // Encompasses Wandel (removed as concept node) and reaches across the whole network.
  { source: "lm-verwandlung", target: "öffnung" },
  { source: "lm-verwandlung", target: "resonanzvernunft" },
  { source: "lm-verwandlung", target: "freiheit" },
  { source: "lm-verwandlung", target: "werden" },
  { source: "lm-verwandlung", target: "resonanz" },
  { source: "lm-verwandlung", target: "welt" },
  { source: "lm-verwandlung", target: "gelassenheit" },
  { source: "lm-verwandlung", target: "transformatives-drittes" },
];

// ─── Erkenntnisprinzipien — Grouped Toggles ───────────────────────────────────
// Meta-layer principles organised into three conceptual groups. Each group can
// be toggled as a whole via the legend; complementary pairs (Schattenlicht,
// Wirklichkeit & Möglichkeit) contain two individually-switchable members.
export interface PrinzipGroup {
  id: string;
  label: string;
  description: string;
  memberIds: string[];
}

export const PRINZIP_GROUPS: PrinzipGroup[] = [
  {
    id: "schattenlicht",
    label: "Schattenlicht",
    description:
      "Erkennen durch Kontrast: Licht und Schatten bilden ein einziges Geschehen der Sichtbarwerdung.",
    memberIds: ["schatten", "licht"],
  },
  {
    id: "raumfaltung",
    label: "Welt- & Raumfaltung",
    description:
      "Entfaltung des Latenten zum Manifesten — jede Begegnung faltet einen neuen Möglichkeitsraum auf. Vier Grundbewegungen: Komplexion, Selektion, Stabilisierung, Variation.",
    memberIds: ["weltfaltung", "raumfaltung"],
  },
  {
    id: "wirklichkeit-moeglichkeit",
    label: "Wirklichkeit & Möglichkeit",
    description:
      "Nicht alles, was möglich ist, ist wirklich. Die Grundspannung des Lebendigen.",
    memberIds: ["wirklichkeit", "moeglichkeit"],
  },
];

// Pair-connection lines for complementary principles.
export const PRINZIP_PAIRS: Array<[string, string]> = [
  ["schatten", "licht"],
  ["wirklichkeit", "moeglichkeit"],
];
