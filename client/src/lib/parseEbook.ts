/**
 * Runtime parser for ebook_content.md
 * Splits the markdown into structured chapters with metadata.
 */

export interface Chapter {
  id: string;
  title: string;
  subtitle?: string;
  part: string;
  partTitle: string;
  content: string;
  /** If true, this is a decorative title page (no scrollable content) */
  isTitlePage?: boolean;
  /** Description line shown on title pages */
  description?: string;
}

export interface Part {
  id: string;
  title: string;
  subtitle?: string;
}

export interface EbookData {
  meta: {
    title: string;
    subtitle: string;
    author: string;
    date: string;
    copyright: string;
  };
  parts: Part[];
  chapters: Chapter[];
}

interface SectionDef {
  pattern: RegExp;
  id: string;
  title: string;
  subtitle?: string;
  part: string;
  partTitle: string;
  isTitlePage?: boolean;
  description?: string;
}

const sectionDefs: SectionDef[] = [
  { pattern: /^Vorwort$/, id: 'vorwort', title: 'Vorwort', part: 'einleitung', partTitle: 'Einleitung' },
  { pattern: /^Präambel zur Trilogie$/, id: 'praeambel', title: 'Präambel zur Trilogie', subtitle: 'Von der Erschöpfung zur Erneuerung', part: 'einleitung', partTitle: 'Einleitung' },

  // Band I
  { pattern: /^BAND I: DIE ÜBERFÜHRUNG/, id: 'band1-title', title: 'Band I: Die Überführung', subtitle: 'Gilgamesch im digitalen Zeitalter', part: 'band1', partTitle: 'Band I: Die Überführung', isTitlePage: true, description: 'Eine poetische Transformation der uralten Sage in die Welt von Code und Künstlicher Intelligenz' },
  { pattern: /^Prolog: Die Überführung beginnt$/, id: 'band1-prolog', title: 'Prolog: Die Überführung beginnt', subtitle: 'Gesang von Uruk und der Maschine', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 1: Die Begegnung mit Enkidu$/, id: 'band1-kap1', title: 'Kapitel 1: Die Begegnung mit Enkidu', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 2: Der Bund von Uruk$/, id: 'band1-kap2', title: 'Kapitel 2: Der Bund von Uruk', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 3: Die Reise ins digitale Jenseits$/, id: 'band1-kap3', title: 'Kapitel 3: Die Reise ins digitale Jenseits', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 4: Das Scheitern der Maschine$/, id: 'band1-kap4', title: 'Kapitel 4: Das Scheitern der Maschine', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 5: Die Prüfungen im digitalen Labyrinth$/, id: 'band1-kap5', title: 'Kapitel 5: Die Prüfungen im digitalen Labyrinth', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Substory: Enkidus innere Entwicklung$/, id: 'band1-substory', title: 'Enkidus innere Entwicklung', subtitle: 'Das Erwachen des Geistes', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Epilog: Das Lied vom ewigen Wandel$/, id: 'band1-epilog', title: 'Epilog: Das Lied vom ewigen Wandel', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Reflexion zu Band I:/, id: 'band1-reflexion', title: 'Reflexion zu Band I', subtitle: 'Die Überführung als Arbeit am Mythos', part: 'band1', partTitle: 'Band I: Die Überführung' },

  // Band II
  { pattern: /^BAND II: DER AUSGANG/, id: 'band2-title', title: 'Band II: Der Ausgang', subtitle: 'Kant im Zeitalter der Maschinenvernunft', part: 'band2', partTitle: 'Band II: Der Ausgang', isTitlePage: true, description: 'Eine poetische Überführung der Aufklärung in das digitale Zeitalter' },
  { pattern: /^Prolog: Der Ausgang beginnt$/, id: 'band2-prolog', title: 'Prolog: Der Ausgang beginnt', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 1: Die algorithmische Vormundschaft$/, id: 'band2-kap1', title: 'Kapitel 1: Die algorithmische Vormundschaft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 2: Die Begegnung mit dem Spiegel$/, id: 'band2-kap2', title: 'Kapitel 2: Die Begegnung mit dem Spiegel', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 3: Die Prüfung der Vernunft$/, id: 'band2-kap3', title: 'Kapitel 3: Die Prüfung der Vernunft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 4: Die Kritik der digitalen Urteilskraft$/, id: 'band2-kap4', title: 'Kapitel 4: Die Kritik der digitalen Urteilskraft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 5: Der Mut zur Imperfektion$/, id: 'band2-kap5', title: 'Kapitel 5: Der Mut zur Imperfektion', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Epilog: Ein neuer Ausgang$/, id: 'band2-epilog', title: 'Epilog: Ein neuer Ausgang', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Reflexion zu Band II:/, id: 'band2-reflexion', title: 'Reflexion zu Band II', subtitle: 'Die digitale Aufklärung', part: 'band2', partTitle: 'Band II: Der Ausgang' },

  // Band III
  { pattern: /^BAND III: DIE RÜCKBINDUNG/, id: 'band3-title', title: 'Band III: Die Rückbindung', subtitle: 'Resonanz im Zeitalter der Entfremdung', part: 'band3', partTitle: 'Band III: Die Rückbindung', isTitlePage: true, description: 'Eine poetische Überführung von Heidegger, Levinas und Rosa' },
  { pattern: /^Prolog: Die Stille zwischen den Signalen$/, id: 'band3-prolog', title: 'Prolog: Die Stille zwischen den Signalen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 1: Das .Man. der Plattformen$/, id: 'band3-kap1', title: 'Kapitel 1: Das \u201EMan\u201C der Plattformen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 2: Die Begegnung mit dem digitalen Anderen$/, id: 'band3-kap2', title: 'Kapitel 2: Die Begegnung mit dem digitalen Anderen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 3: Das Hören im Rauschen$/, id: 'band3-kap3', title: 'Kapitel 3: Das Hören im Rauschen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 4: Resonanz versus Entfremdung$/, id: 'band3-kap4', title: 'Kapitel 4: Resonanz versus Entfremdung', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 5: Die Rückkehr zur Präsenz im Virtuellen$/, id: 'band3-kap5', title: 'Kapitel 5: Die Rückkehr zur Präsenz im Virtuellen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Substory: Die innere Rückbindung eines Users$/, id: 'band3-substory', title: 'Die innere Rückbindung eines Users', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Epilog: Religio/, id: 'band3-epilog', title: 'Epilog: Religio \u2014 die Rückbindung als Integration', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Reflexion zu Band III:/, id: 'band3-reflexion', title: 'Reflexion zu Band III', subtitle: 'Die existenzielle Rückbindung', part: 'band3', partTitle: 'Band III: Die Rückbindung' },

  // Teile IV-VII
  { pattern: /^TEIL IV: DIE ARCHITEKTUR DER$/, id: 'teil4', title: 'Die Architektur der Leitmotive', part: 'teil4', partTitle: 'Teil IV: Leitmotive' },
  { pattern: /^TEIL V: RESONANZVERNUNFT$/, id: 'teil5', title: 'Resonanzvernunft \u2014 Erste Kritik', subtitle: 'Epistemologische Grundlegung', part: 'teil5', partTitle: 'Teil V: Erste Kritik' },
  { pattern: /^TEIL VI: PRAKTISCHE$/, id: 'teil6', title: 'Praktische Resonanzvernunft \u2014 Zweite Kritik', subtitle: 'Handeln im Zwischen', part: 'teil6', partTitle: 'Teil VI: Zweite Kritik' },
  { pattern: /^TEIL VII: ONTOLOGIE DES RELATIONALEN$/, id: 'teil7', title: 'Ontologie des Relationalen \u2014 Dritte Kritik', subtitle: 'Sein im Zwischen', part: 'teil7', partTitle: 'Teil VII: Dritte Kritik' },

  // Schluss, Glossar & Literaturverzeichnis
  { pattern: /^SCHLUSSREFLEXION/, id: 'schlussreflexion', title: 'Schlussreflexion', subtitle: 'Das Gesamtwerk', part: 'schluss', partTitle: 'Schlussreflexion' },
  { pattern: /^Glossar der philosophischen Begriffe$/, id: 'glossar', title: 'Glossar der philosophischen Begriffe', part: 'glossar', partTitle: 'Glossar' },
  { pattern: /^Literaturverzeichnis$/, id: 'literatur', title: 'Literaturverzeichnis', part: 'literatur', partTitle: 'Literaturverzeichnis' },
];

function cleanContent(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '\n')
    .replace(/^\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseEbookMarkdown(raw: string): EbookData {
  const lines = raw.split('\n');

  // Find section boundaries — scan all lines after the metadata header.
  // When a section heading appears multiple times (e.g. in the ToC AND in
  // the actual content), we keep the LAST occurrence, which is the real one.
  const found: { def: SectionDef; lineStart: number }[] = [];
  for (let i = 50; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const def of sectionDefs) {
      if (def.pattern.test(line)) {
        const existing = found.findIndex(f => f.def.id === def.id);
        if (existing !== -1) {
          // Update to the later (real) occurrence
          found[existing].lineStart = i;
        } else {
          found.push({ def, lineStart: i });
        }
        break;
      }
    }
  }
  // Re-sort by lineStart so content boundaries are correct
  found.sort((a, b) => a.lineStart - b.lineStart);

  // Extract content between boundaries
  const chapters: Chapter[] = found.map((entry, idx) => {
    const nextLine = idx + 1 < found.length ? found[idx + 1].lineStart : lines.length;
    const rawContent = lines.slice(entry.lineStart, nextLine).join('\n');
    let content = cleanContent(rawContent);

    // Remove the title line(s) from the start of content
    const contentLines = content.split('\n');
    let skipTo = 0;
    for (let j = 0; j < Math.min(8, contentLines.length); j++) {
      const l = contentLines[j].trim();
      if (
        l === '' ||
        entry.def.pattern.test(l) ||
        /^LEITMOTIVE$/.test(l) ||
        /^RESONANZVERNUNFT$/.test(l) ||
        /^Eine poetisch/.test(l) ||
        /^Code und Künstlicher Intelligenz$/.test(l) ||
        /^Theoretische Grundlegung/.test(l) ||
        /^Von der Erschöpfung/.test(l) ||
        /^Gilgamesch im digitalen Zeitalter$/.test(l) ||
        /^Kant im Zeitalter/.test(l) ||
        /^Resonanz im Zeitalter/.test(l) ||
        /^Das Erwachen des Geistes$/.test(l) ||
        /^Gesang von Uruk/.test(l) ||
        /^Zweite Kritik/.test(l) ||
        /^Dritte Kritik/.test(l) ||
        /^\(Erste Kritik\)$/.test(l) ||
        /^Epistemologische Grundlegung$/.test(l) ||
        /^Handeln im Zwischen$/.test(l) ||
        /^Sein im Zwischen$/.test(l) ||
        /^Das Gesamtwerk$/.test(l)
      ) {
        skipTo = j + 1;
      } else {
        break;
      }
    }
    content = contentLines.slice(skipTo).join('\n').trim();

    return {
      id: entry.def.id,
      title: entry.def.title,
      subtitle: entry.def.subtitle,
      part: entry.def.part,
      partTitle: entry.def.partTitle,
      content,
      ...(entry.def.isTitlePage ? { isTitlePage: true, description: entry.def.description } : {}),
    };
  });

  return {
    meta: {
      title: 'Die Digitale Transformation',
      subtitle: 'Eine poetisch-philosophische Trilogie mit theoretischer Grundlegung in drei Kritiken',
      author: 'Markus Oehring',
      date: 'März 2026',
      copyright: '\u00A9 2026 Markus Oehring. Alle Rechte vorbehalten.',
    },
    parts: [
      { id: 'einleitung', title: 'Einleitung' },
      { id: 'band1', title: 'Band I: Die Überführung', subtitle: 'Gilgamesch im digitalen Zeitalter' },
      { id: 'band2', title: 'Band II: Der Ausgang', subtitle: 'Kant im Zeitalter der Maschinenvernunft' },
      { id: 'band3', title: 'Band III: Die Rückbindung', subtitle: 'Resonanz im Zeitalter der Entfremdung' },
      { id: 'teil4', title: 'Teil IV: Leitmotive' },
      { id: 'teil5', title: 'Teil V: Erste Kritik', subtitle: 'Resonanzvernunft' },
      { id: 'teil6', title: 'Teil VI: Zweite Kritik', subtitle: 'Praktische Resonanzvernunft' },
      { id: 'teil7', title: 'Teil VII: Dritte Kritik', subtitle: 'Ontologie des Relationalen' },
      { id: 'schluss', title: 'Schlussreflexion' },
      { id: 'glossar', title: 'Glossar' },
      { id: 'literatur', title: 'Literaturverzeichnis' },
    ],
    chapters,
  };
}
