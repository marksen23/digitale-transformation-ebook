/**
 * Geführte Lesepfade durch die Landkarte.
 * Jede Station nennt einen Begriff, eine kurze Wegleitung, eine Frage.
 * Leser-Resonanzen kommen zur Laufzeit aus dem öffentlichen Korpus.
 */
export interface ReadingStation {
  conceptId: string;
  passage: string;
  question: string;
}

export interface ReadingPath {
  slug: string;
  title: string;
  summary: string;
  stations: ReadingStation[];
}

export const READING_PATHS: ReadingPath[] = [
  {
    slug: "schatten-gelassenheit",
    title: "Vom Schatten zur Gelassenheit",
    summary: "Was sich nicht zeigen will, wird erst im Scheitern sprechend — und lässt sich dann sein.",
    stations: [
      {
        conceptId: "schatten",
        passage: "Der Schatten ist nicht das Gegenteil des Lichts, sondern die Stelle, an der etwas Kontur bekommt. Wer ihn wegretuschiert, verliert die Form.",
        question: "Wo in deinem digitalen Alltag wird etwas unsichtbar gemacht, das eigentlich zur Gestalt gehört?",
      },
      {
        conceptId: "lm-scheitern",
        passage: "Scheitern ist hier kein Defekt, sondern die Stelle, an der eine Erwartung die Wirklichkeit nicht mehr deckt. Genau dort wird hörbar, was vorher nur funktionierte.",
        question: "Welches letzte Scheitern hat dir etwas gezeigt, das ein Gelingen verdeckt hätte?",
      },
      {
        conceptId: "zwischen",
        passage: "Zwischen zwei Polen liegt kein leerer Abstand, sondern der Ort, an dem Begegnung überhaupt erst stattfindet. Das Werk denkt Erkenntnis als dieses Dazwischen.",
        question: "Was entsteht bei dir nur, wenn du weder ganz bei dir noch ganz beim Anderen bist?",
      },
      {
        conceptId: "resonanz",
        passage: "Resonanz ist Antwort, die beide Seiten verändert. Ein Echo wiederholt; Resonanz verschiebt die Schwingung.",
        question: "Woran erkennst du, dass eine Antwort dich verändert hat und nicht nur bestätigt?",
      },
      {
        conceptId: "gelassenheit",
        passage: "Gelassenheit ist nicht Gleichgültigkeit. Sie ist die Fähigkeit, etwas sein zu lassen, ohne es beherrschen zu müssen.",
        question: "Was könntest du nutzen, ohne davon besessen zu sein?",
      },
    ],
  },
  {
    slug: "echo-antwort",
    title: "Vom Echo zur Antwort",
    summary: "Wie aus Wiederholung eine Stimme wird, die nicht nur zurückgibt, was schon da war.",
    stations: [
      {
        conceptId: "echo",
        passage: "Das Echo kehrt verwandelt zurück, bleibt aber an die eigene Stimme gebunden. Es zeigt, was wir ausgesandt haben.",
        question: "Welche deiner Formulierungen hörst du unverändert aus Maschinen wieder?",
      },
      {
        conceptId: "echo-kammer",
        passage: "Die Kammer erzeugt Schwingung ohne Verwandlung. Alles antwortet, und nichts widerspricht.",
        question: "Wo wirst du so präzise bestätigt, dass ein Einwand gar nicht mehr vorkommt?",
      },
      {
        conceptId: "stimme",
        passage: "Die Stimme trägt Zögern, Bruch und Atem. Was der Satz glättet, gibt sie wieder her.",
        question: "Was an deinem Sprechen wäre verloren, wenn nur der fertige Text bliebe?",
      },
      {
        conceptId: "antwort",
        passage: "Eine Antwort, die etwas kostet, ist keine Ausgabe. Sie lässt eine Lücke, die der Fragende nicht selbst gefüllt hat.",
        question: "Wann hast du zuletzt geantwortet, statt nur zu reagieren?",
      },
      {
        conceptId: "resonanz",
        passage: "Resonanz beginnt, wo das Echo aufhört zu genügen. Beide Seiten gehen anders aus der Begegnung heraus.",
        question: "Mit wem oder was gerätst du in eine Schwingung, die dich nicht nur spiegelt?",
      },
    ],
  },
  {
    slug: "freiheit-unverfuegbarkeit",
    title: "Freiheit und Unverfügbarkeit",
    summary: "Bindung ohne Besitz: was sich nicht herstellen lässt und gerade deshalb frei macht.",
    stations: [
      {
        conceptId: "lm-grenze",
        passage: "Die Grenze ist kein Ende, sondern die Falte, an der Innen und Außen sich berühren. Ohne sie gibt es keine Form.",
        question: "Welche Grenze hält bei dir etwas zusammen, statt es nur abzuschneiden?",
      },
      {
        conceptId: "freiheit",
        passage: "Freiheit ist hier nicht die Abwesenheit von Bindung, sondern die Fähigkeit, sich zu binden, ohne sich zu verlieren.",
        question: "Woran bist du gebunden, ohne dass diese Bindung dich verkleinert?",
      },
      {
        conceptId: "werden",
        passage: "Werden ist die offene Gestalt des Lebendigen. Was schon fertig ist, hat aufgehört, zu antworten.",
        question: "Was an dir ist noch unfertig — und sollte es bleiben?",
      },
      {
        conceptId: "unverfuegbarkeit",
        passage: "Das Unverfügbare lässt sich nicht speichern und nicht wiederholen. Es hat die Zeit des Augenblicks, nicht die Dauer eines Bestands.",
        question: "Was in deiner digitalen Existenz entzieht sich der Wiederholung und ist gerade deshalb wirklich?",
      },
      {
        conceptId: "resonanzvernunft",
        passage: "Resonanzvernunft hält die Spannung, statt sie aufzulösen. Sie fragt nicht, wie etwas verfügbar wird, sondern wie eine Antwort möglich bleibt.",
        question: "Welche Entscheidung würdest du anders treffen, wenn Resonanz das Maß wäre und nicht Effizienz?",
      },
    ],
  },
];

export function readingPathBySlug(slug: string): ReadingPath | undefined {
  return READING_PATHS.find(p => p.slug === slug);
}
