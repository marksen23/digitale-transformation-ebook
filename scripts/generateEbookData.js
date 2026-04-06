const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'ebook_content.md');
const outputPath = path.join(__dirname, '..', 'client', 'src', 'data', 'ebookContent.ts');

const raw = fs.readFileSync(inputPath, 'utf-8');

// Remove page headers like "DIE DIGITALE TRANSFORMATION\n12\n" or similar
// The pattern is: \nDIE DIGITALE TRANSFORMATION\n{number}\n
let cleaned = raw.replace(/\n?DIE DIGITALE TRANSFORMATION\s*\n\d+\n/g, '\n');

// Split into lines for processing
const lines = cleaned.split('\n');

// Define section markers and their metadata
const sections = [
  { startPattern: /^Vorwort$/, id: 'vorwort', title: 'Vorwort', part: 'einleitung', partTitle: 'Einleitung' },
  { startPattern: /^Präambel zur Trilogie$/, id: 'praeambel', title: 'Präambel zur Trilogie', subtitle: 'Von der Erschöpfung zur Erneuerung', part: 'einleitung', partTitle: 'Einleitung' },
  { startPattern: /^BAND I: DIE ÜBERFÜHRUNG$/, id: 'band1-intro', title: 'Band I: Die Überführung', subtitle: 'Gilgamesch im digitalen Zeitalter', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Prolog: Die Überführung beginnt$/, id: 'band1-prolog', title: 'Prolog: Die Überführung beginnt', subtitle: 'Gesang von Uruk und der Maschine', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Kapitel 1: Die Begegnung mit Enkidu$/, id: 'band1-kap1', title: 'Kapitel 1: Die Begegnung mit Enkidu', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Kapitel 2: Der Bund von Uruk$/, id: 'band1-kap2', title: 'Kapitel 2: Der Bund von Uruk', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Kapitel 3: Die Reise ins digitale Jenseits$/, id: 'band1-kap3', title: 'Kapitel 3: Die Reise ins digitale Jenseits', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Kapitel 4: Das Scheitern der Maschine$/, id: 'band1-kap4', title: 'Kapitel 4: Das Scheitern der Maschine', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Kapitel 5: Die Prüfungen im digitalen Labyrinth$/, id: 'band1-kap5', title: 'Kapitel 5: Die Prüfungen im digitalen Labyrinth', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Substory: Enkidus innere Entwicklung$/, id: 'band1-substory', title: 'Substory: Enkidus innere Entwicklung', subtitle: 'Das Erwachen des Geistes', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Epilog: Das Lied vom ewigen Wandel$/, id: 'band1-epilog', title: 'Epilog: Das Lied vom ewigen Wandel', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^Reflexion zu Band I/, id: 'band1-reflexion', title: 'Reflexion zu Band I: Die Überführung als Arbeit am Mythos', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { startPattern: /^BAND II: DER AUSGANG$/, id: 'band2-intro', title: 'Band II: Der Ausgang', subtitle: 'Kant im Zeitalter der Maschinenvernunft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Prolog: Der Ausgang beginnt$/, id: 'band2-prolog', title: 'Prolog: Der Ausgang beginnt', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Kapitel 1: Die algorithmische Vormundschaft$/, id: 'band2-kap1', title: 'Kapitel 1: Die algorithmische Vormundschaft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Kapitel 2: Die Begegnung mit dem Spiegel$/, id: 'band2-kap2', title: 'Kapitel 2: Die Begegnung mit dem Spiegel', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Kapitel 3: Die Prüfung der Vernunft$/, id: 'band2-kap3', title: 'Kapitel 3: Die Prüfung der Vernunft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Kapitel 4: Die Kritik der digitalen Urteilskraft$/, id: 'band2-kap4', title: 'Kapitel 4: Die Kritik der digitalen Urteilskraft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Kapitel 5: Der Mut zur Imperfektion$/, id: 'band2-kap5', title: 'Kapitel 5: Der Mut zur Imperfektion', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Epilog: Ein neuer Ausgang$/, id: 'band2-epilog', title: 'Epilog: Ein neuer Ausgang', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^Reflexion zu Band II/, id: 'band2-reflexion', title: 'Reflexion zu Band II: Die digitale Aufklärung', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { startPattern: /^BAND III: DIE RÜCKBINDUNG$/, id: 'band3-intro', title: 'Band III: Die Rückbindung', subtitle: 'Resonanz im Zeitalter der Entfremdung', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Prolog: Die Stille zwischen den Signalen$/, id: 'band3-prolog', title: 'Prolog: Die Stille zwischen den Signalen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Kapitel 1: Das „Man" der Plattformen$/, id: 'band3-kap1', title: 'Kapitel 1: Das \u201eMan\u201c der Plattformen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Kapitel 2: Die Begegnung mit dem digitalen Anderen$/, id: 'band3-kap2', title: 'Kapitel 2: Die Begegnung mit dem digitalen Anderen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Kapitel 3: Das Hören im Rauschen$/, id: 'band3-kap3', title: 'Kapitel 3: Das Hören im Rauschen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Kapitel 4: Resonanz versus Entfremdung$/, id: 'band3-kap4', title: 'Kapitel 4: Resonanz versus Entfremdung', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Kapitel 5: Die Rückkehr zur Präsenz im Virtuellen$/, id: 'band3-kap5', title: 'Kapitel 5: Die Rückkehr zur Präsenz im Virtuellen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Substory: Die innere Rückbindung eines Users$/, id: 'band3-substory', title: 'Substory: Die innere Rückbindung eines Users', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Epilog: Religio/, id: 'band3-epilog', title: 'Epilog: Religio \u2013 die Rückbindung als Integration', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^Reflexion zu Band III/, id: 'band3-reflexion', title: 'Reflexion zu Band III: Die existenzielle Rückbindung', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { startPattern: /^TEIL IV: DIE ARCHITEKTUR DER/, id: 'teil4', title: 'Teil IV: Die Architektur der Leitmotive', part: 'teil4', partTitle: 'Teil IV: Leitmotive' },
  { startPattern: /^TEIL V: RESONANZVERNUNFT$/, id: 'teil5', title: 'Teil V: Resonanzvernunft', subtitle: 'Eine Epistemologie des transformativen Dritten im digitalen Zeitalter', part: 'teil5', partTitle: 'Teil V: Erste Kritik' },
  { startPattern: /^TEIL VI: PRAKTISCHE$/, id: 'teil6', title: 'Teil VI: Praktische Resonanzvernunft', subtitle: 'Zweite Kritik \u2013 Handeln im Zwischen', part: 'teil6', partTitle: 'Teil VI: Zweite Kritik' },
  { startPattern: /^TEIL VII: ONTOLOGIE DES RELATIONALEN$/, id: 'teil7', title: 'Teil VII: Ontologie des Relationalen', subtitle: 'Dritte Kritik \u2013 Sein im Zwischen', part: 'teil7', partTitle: 'Teil VII: Dritte Kritik' },
  { startPattern: /^SCHLUSSREFLEXION/, id: 'schlussreflexion', title: 'Schlussreflexion: Das Gesamtwerk', part: 'schluss', partTitle: 'Schlussreflexion' },
  { startPattern: /^Glossar der philosophischen Begriffe$/, id: 'glossar', title: 'Glossar der philosophischen Begriffe', part: 'glossar', partTitle: 'Glossar' },
];

// Find line indices for each section
function findSectionStarts(lines) {
  const results = [];
  for (const section of sections) {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (section.startPattern.test(trimmed)) {
        // For sections after the TOC (line ~56-71), skip TOC entries
        // The TOC mentions these titles briefly; real sections have content after
        // We want the LAST match for TOC items, or more precisely, the one after line 72
        // Actually let's find all matches and pick the right one
        // For Vorwort: appears at line 57 (TOC) and line 73 (actual)
        // We want the one after the TOC
        results.push({ ...section, lineIndex: i });
      }
    }
  }

  // Deduplicate: for sections that appear in TOC and content, take the later one
  // Group by id
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.id]) grouped[r.id] = [];
    grouped[r.id].push(r);
  }

  const final = [];
  for (const id of Object.keys(grouped)) {
    const entries = grouped[id];
    if (entries.length > 1) {
      // Take the last occurrence (after TOC)
      final.push(entries[entries.length - 1]);
    } else {
      final.push(entries[0]);
    }
  }

  // Sort by lineIndex
  final.sort((a, b) => a.lineIndex - b.lineIndex);
  return final;
}

const sectionStarts = findSectionStarts(lines);

// Extract content for each section
const chapters = [];
for (let i = 0; i < sectionStarts.length; i++) {
  const current = sectionStarts[i];
  const nextIndex = i + 1 < sectionStarts.length ? sectionStarts[i + 1].lineIndex : lines.length;

  // Get lines from start to next section
  let sectionLines = lines.slice(current.lineIndex, nextIndex);

  // Remove the title line(s) from the content
  // The first line is the title, remove it
  // For some sections, the subtitle is the next non-empty line
  let contentStartIdx = 1; // skip title line

  // For band intros and some sections with subtitles, skip subtitle lines too
  // Skip subtitle lines that match the section's subtitle
  if (current.subtitle) {
    // Skip empty lines and subtitle
    while (contentStartIdx < sectionLines.length && sectionLines[contentStartIdx].trim() === '') {
      contentStartIdx++;
    }
    // Check if next non-empty line is the subtitle
    if (contentStartIdx < sectionLines.length) {
      const nextNonEmpty = sectionLines[contentStartIdx].trim();
      if (current.subtitle && nextNonEmpty === current.subtitle) {
        contentStartIdx++;
      } else if (current.id === 'praeambel' && nextNonEmpty === 'Von der Erschöpfung zur Erneuerung') {
        contentStartIdx++;
      }
    }
  }

  // For band intro sections (band1-intro, band2-intro, band3-intro), also skip the subtitle line
  if (current.id.endsWith('-intro')) {
    // These have format:
    // BAND I: DIE ÜBERFÜHRUNG
    // Gilgamesch im digitalen Zeitalter
    // Eine poetische Transformation...
    // We want to skip the first line (title) and include rest as content
    contentStartIdx = 1;
    // Skip empty lines
    while (contentStartIdx < sectionLines.length && sectionLines[contentStartIdx].trim() === '') {
      contentStartIdx++;
    }
    // Skip subtitle line
    if (contentStartIdx < sectionLines.length) {
      contentStartIdx++; // skip subtitle like "Gilgamesch im digitalen Zeitalter"
    }
  }

  // For TEIL sections that have multiline titles (TEIL VI: PRAKTISCHE / RESONANZVERNUNFT)
  if (current.id === 'teil6') {
    // title spans two lines: "TEIL VI: PRAKTISCHE" then "RESONANZVERNUNFT"
    contentStartIdx = 1;
    while (contentStartIdx < sectionLines.length && sectionLines[contentStartIdx].trim() === '') {
      contentStartIdx++;
    }
    if (contentStartIdx < sectionLines.length && sectionLines[contentStartIdx].trim() === 'RESONANZVERNUNFT') {
      contentStartIdx++;
    }
  }

  if (current.id === 'teil4') {
    // title spans two lines: "TEIL IV: DIE ARCHITEKTUR DER" then "LEITMOTIVE"
    contentStartIdx = 1;
    while (contentStartIdx < sectionLines.length && sectionLines[contentStartIdx].trim() === '') {
      contentStartIdx++;
    }
    if (contentStartIdx < sectionLines.length && sectionLines[contentStartIdx].trim() === 'LEITMOTIVE') {
      contentStartIdx++;
    }
  }

  let content = sectionLines.slice(contentStartIdx).join('\n');

  // Clean up: trim leading/trailing whitespace
  content = content.trim();

  // Remove any remaining page headers that might have been missed
  content = content.replace(/DIE DIGITALE TRANSFORMATION\s*\n\d+/g, '');

  // Clean up multiple blank lines (more than 2 consecutive newlines -> 2)
  content = content.replace(/\n{3,}/g, '\n\n');

  content = content.trim();

  chapters.push({
    id: current.id,
    title: current.title,
    subtitle: current.subtitle,
    part: current.part,
    partTitle: current.partTitle,
    content: content,
  });
}

// For band intro sections, we don't really need separate intro chapters
// since the next section (prolog) follows immediately
// Let's check if intro sections have meaningful content
// Actually, they have introductory text like "Eine poetische Transformation..."
// Keep them but merge: the intro describes the band

// Generate TypeScript file
function escapeForTemplate(str) {
  // Escape backticks and ${
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

let output = `export interface Chapter {
  id: string;
  title: string;
  subtitle?: string;
  part: string;
  partTitle: string;
  content: string;
}

export interface Part {
  id: string;
  title: string;
  subtitle?: string;
}

export const meta = {
  title: 'Die Digitale Transformation',
  subtitle: 'Eine poetisch-philosophische Trilogie mit theoretischer Grundlegung in drei Kritiken',
  author: 'Markus Oehring',
  date: 'M\\u00E4rz 2026',
  copyright: '\\u00A9 2026 Markus Oehring. Alle Rechte vorbehalten.',
};

export const parts: Part[] = [
  { id: 'einleitung', title: 'Einleitung' },
  { id: 'band1', title: 'Band I: Die \\u00DCberf\\u00FChrung', subtitle: 'Gilgamesch im digitalen Zeitalter' },
  { id: 'band2', title: 'Band II: Der Ausgang', subtitle: 'Kant im Zeitalter der Maschinenvernunft' },
  { id: 'band3', title: 'Band III: Die R\\u00FCckbindung', subtitle: 'Resonanz im Zeitalter der Entfremdung' },
  { id: 'teil4', title: 'Teil IV: Leitmotive' },
  { id: 'teil5', title: 'Teil V: Erste Kritik', subtitle: 'Resonanzvernunft' },
  { id: 'teil6', title: 'Teil VI: Zweite Kritik', subtitle: 'Praktische Resonanzvernunft' },
  { id: 'teil7', title: 'Teil VII: Dritte Kritik', subtitle: 'Ontologie des Relationalen' },
  { id: 'schluss', title: 'Schlussreflexion' },
  { id: 'glossar', title: 'Glossar' },
];

export const chapters: Chapter[] = [
`;

for (const ch of chapters) {
  const escapedContent = escapeForTemplate(ch.content);
  const subtitleLine = ch.subtitle ? `  subtitle: \`${escapeForTemplate(ch.subtitle)}\`,\n` : '';

  output += `  {
    id: '${ch.id}',
    title: \`${escapeForTemplate(ch.title)}\`,
${subtitleLine}    part: '${ch.part}',
    partTitle: \`${escapeForTemplate(ch.partTitle)}\`,
    content: \`${escapedContent}\`,
  },
`;
}

output += `];
`;

fs.writeFileSync(outputPath, output, 'utf-8');
console.log(`Generated ${outputPath}`);
console.log(`Total chapters: ${chapters.length}`);
for (const ch of chapters) {
  console.log(`  ${ch.id}: ${ch.content.length} chars`);
}
