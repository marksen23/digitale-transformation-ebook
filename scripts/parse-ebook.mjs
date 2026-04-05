#!/usr/bin/env node
/**
 * Parse ebook_content.md into structured JSON for the web reader.
 * Outputs client/public/ebook_structured.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const raw = fs.readFileSync(path.join(ROOT, 'ebook_content.md'), 'utf-8');
const lines = raw.split('\n');

// Remove page headers like "DIE DIGITALE TRANSFORMATION\n12\n"
function cleanContent(text) {
  return text
    .replace(/\n\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '\n')
    .replace(/^\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Section markers with their IDs and hierarchy
const sectionPatterns = [
  { pattern: /^Vorwort$/, id: 'vorwort', title: 'Vorwort', part: 'einleitung', partTitle: 'Einleitung' },
  { pattern: /^Präambel zur Trilogie$/, id: 'praeambel', title: 'Präambel zur Trilogie', part: 'einleitung', partTitle: 'Einleitung' },

  // Band I
  { pattern: /^BAND I: DIE ÜBERFÜHRUNG$/, id: 'band1-intro', title: 'Band I: Die Überführung', subtitle: 'Gilgamesch im digitalen Zeitalter', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Prolog: Die Überführung beginnt$/, id: 'band1-prolog', title: 'Prolog: Die Überführung beginnt', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 1: Die Begegnung mit Enkidu$/, id: 'band1-kap1', title: 'Die Begegnung mit Enkidu', chapter: 1, part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 2: Der Bund von Uruk$/, id: 'band1-kap2', title: 'Der Bund von Uruk', chapter: 2, part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 3: Die Reise ins digitale Jenseits$/, id: 'band1-kap3', title: 'Die Reise ins digitale Jenseits', chapter: 3, part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 4: Das Scheitern der Maschine$/, id: 'band1-kap4', title: 'Das Scheitern der Maschine', chapter: 4, part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Kapitel 5: Die Prüfungen im digitalen Labyrinth$/, id: 'band1-kap5', title: 'Die Prüfungen im digitalen Labyrinth', chapter: 5, part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Substory: Enkidus innere Entwicklung$/, id: 'band1-substory', title: 'Enkidus innere Entwicklung', subtitle: 'Das Erwachen des Geistes', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Epilog: Das Lied vom ewigen Wandel$/, id: 'band1-epilog', title: 'Epilog: Das Lied vom ewigen Wandel', part: 'band1', partTitle: 'Band I: Die Überführung' },
  { pattern: /^Reflexion zu Band I/, id: 'band1-reflexion', title: 'Reflexion zu Band I', subtitle: 'Die Überführung als Arbeit am Mythos', part: 'band1', partTitle: 'Band I: Die Überführung' },

  // Band II
  { pattern: /^BAND II: DER AUSGANG$/, id: 'band2-intro', title: 'Band II: Der Ausgang', subtitle: 'Kant im Zeitalter der Maschinenvernunft', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Prolog: Der Ausgang beginnt$/, id: 'band2-prolog', title: 'Prolog: Der Ausgang beginnt', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 1: Die algorithmische Vormundschaft$/, id: 'band2-kap1', title: 'Die algorithmische Vormundschaft', chapter: 1, part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 2: Die Begegnung mit dem Spiegel$/, id: 'band2-kap2', title: 'Die Begegnung mit dem Spiegel', chapter: 2, part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 3: Die Prüfung der Vernunft$/, id: 'band2-kap3', title: 'Die Prüfung der Vernunft', chapter: 3, part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 4: Die Kritik der digitalen Urteilskraft$/, id: 'band2-kap4', title: 'Die Kritik der digitalen Urteilskraft', chapter: 4, part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Kapitel 5: Der Mut zur Imperfektion$/, id: 'band2-kap5', title: 'Der Mut zur Imperfektion', chapter: 5, part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Epilog: Ein neuer Ausgang$/, id: 'band2-epilog', title: 'Epilog: Ein neuer Ausgang', part: 'band2', partTitle: 'Band II: Der Ausgang' },
  { pattern: /^Reflexion zu Band II/, id: 'band2-reflexion', title: 'Reflexion zu Band II', subtitle: 'Die digitale Aufklärung', part: 'band2', partTitle: 'Band II: Der Ausgang' },

  // Band III
  { pattern: /^BAND III: DIE RÜCKBINDUNG$/, id: 'band3-intro', title: 'Band III: Die Rückbindung', subtitle: 'Resonanz im Zeitalter der Entfremdung', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Prolog: Die Stille zwischen den Signalen$/, id: 'band3-prolog', title: 'Prolog: Die Stille zwischen den Signalen', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 1: Das „Man" der Plattformen$/, id: 'band3-kap1', title: 'Das "Man" der Plattformen', chapter: 1, part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 2: Die Begegnung mit dem digitalen Anderen$/, id: 'band3-kap2', title: 'Die Begegnung mit dem digitalen Anderen', chapter: 2, part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 3: Das Hören im Rauschen$/, id: 'band3-kap3', title: 'Das Hören im Rauschen', chapter: 3, part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 4: Resonanz versus Entfremdung$/, id: 'band3-kap4', title: 'Resonanz versus Entfremdung', chapter: 4, part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Kapitel 5: Die Rückkehr zur Präsenz im Virtuellen$/, id: 'band3-kap5', title: 'Die Rückkehr zur Präsenz im Virtuellen', chapter: 5, part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Substory: Die innere Rückbindung eines Users$/, id: 'band3-substory', title: 'Die innere Rückbindung eines Users', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Epilog: Religio/, id: 'band3-epilog', title: 'Epilog: Religio', subtitle: 'Die Rückbindung als Integration', part: 'band3', partTitle: 'Band III: Die Rückbindung' },
  { pattern: /^Reflexion zu Band III/, id: 'band3-reflexion', title: 'Reflexion zu Band III', subtitle: 'Die existenzielle Rückbindung', part: 'band3', partTitle: 'Band III: Die Rückbindung' },

  // Teil IV
  { pattern: /^TEIL IV: DIE ARCHITEKTUR DER$/, id: 'teil4', title: 'Teil IV: Die Architektur der Leitmotive', part: 'teil4', partTitle: 'Teil IV: Die Architektur der Leitmotive' },

  // Teil V
  { pattern: /^TEIL V: RESONANZVERNUNFT$/, id: 'teil5', title: 'Teil V: Resonanzvernunft', subtitle: 'Erste Kritik — Epistemologische Grundlegung', part: 'teil5', partTitle: 'Teil V: Resonanzvernunft' },

  // Teil VI
  { pattern: /^TEIL VI: PRAKTISCHE$/, id: 'teil6', title: 'Teil VI: Praktische Resonanzvernunft', subtitle: 'Zweite Kritik', part: 'teil6', partTitle: 'Teil VI: Praktische Resonanzvernunft' },

  // Teil VII
  { pattern: /^TEIL VII: ONTOLOGIE DES RELATIONALEN$/, id: 'teil7', title: 'Teil VII: Ontologie des Relationalen', subtitle: 'Dritte Kritik', part: 'teil7', partTitle: 'Teil VII: Ontologie des Relationalen' },

  // Schlussreflexion
  { pattern: /^SCHLUSSREFLEXION/, id: 'schlussreflexion', title: 'Schlussreflexion', subtitle: 'Das Gesamtwerk', part: 'schluss', partTitle: 'Schlussreflexion' },

  // Glossar
  { pattern: /^Glossar der philosophischen Begriffe$/, id: 'glossar', title: 'Glossar der philosophischen Begriffe', part: 'glossar', partTitle: 'Glossar' },
];

// Find all section boundaries
const sections = [];
let currentLine = 0;

// Skip the title page (first ~55 lines with metadata)
// Find first "Vorwort" after "Inhalt" section
let contentStart = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'Vorwort' && i > 55) {
    contentStart = i;
    break;
  }
}

// Scan through all lines starting from contentStart
for (let i = contentStart; i < lines.length; i++) {
  const line = lines[i].trim();
  for (const sp of sectionPatterns) {
    if (sp.pattern.test(line)) {
      sections.push({
        ...sp,
        lineStart: i,
        pattern: undefined // remove regex from output
      });
      break;
    }
  }
}

// Set lineEnd for each section
for (let i = 0; i < sections.length; i++) {
  sections[i].lineEnd = (i + 1 < sections.length) ? sections[i + 1].lineStart : lines.length;
}

// Extract content for each section
const chapters = sections.map(sec => {
  const content = lines.slice(sec.lineStart, sec.lineEnd).join('\n');
  const cleaned = cleanContent(content);

  // Remove the title line from content (it's already in metadata)
  let body = cleaned;
  // Remove first line(s) that match the title
  const bodyLines = body.split('\n');
  let skipTo = 0;
  for (let i = 0; i < Math.min(5, bodyLines.length); i++) {
    const l = bodyLines[i].trim();
    if (l === '' ||
        sectionPatterns.some(sp => sp.pattern.test(l)) ||
        l === 'LEITMOTIVE' ||
        l === 'RESONANZVERNUNFT' ||
        /^Eine poetische/.test(l) ||
        /^Theoretische Grundlegung/.test(l) ||
        /^Von der Erschöpfung/.test(l) ||
        /^Gilgamesch im digitalen Zeitalter$/.test(l) ||
        /^Kant im Zeitalter/.test(l) ||
        /^Resonanz im Zeitalter/.test(l) ||
        /^Das Erwachen des Geistes$/.test(l) ||
        /^\(Erste Kritik\)$/.test(l) ||
        /^Mythos$/.test(l)
    ) {
      skipTo = i + 1;
    } else {
      break;
    }
  }
  body = bodyLines.slice(skipTo).join('\n').trim();

  return {
    id: sec.id,
    title: sec.title,
    subtitle: sec.subtitle || null,
    chapter: sec.chapter || null,
    part: sec.part,
    partTitle: sec.partTitle,
    content: body,
  };
});

// Build navigation structure
const parts = [
  { id: 'einleitung', title: 'Einleitung', icon: 'BookOpen' },
  { id: 'band1', title: 'Band I: Die Überführung', subtitle: 'Gilgamesch im digitalen Zeitalter', icon: 'Scroll' },
  { id: 'band2', title: 'Band II: Der Ausgang', subtitle: 'Kant im Zeitalter der Maschinenvernunft', icon: 'Lightbulb' },
  { id: 'band3', title: 'Band III: Die Rückbindung', subtitle: 'Resonanz im Zeitalter der Entfremdung', icon: 'Heart' },
  { id: 'teil4', title: 'Teil IV: Leitmotive', subtitle: 'Die Architektur der Leitmotive', icon: 'Music' },
  { id: 'teil5', title: 'Teil V: Erste Kritik', subtitle: 'Resonanzvernunft', icon: 'Brain' },
  { id: 'teil6', title: 'Teil VI: Zweite Kritik', subtitle: 'Praktische Resonanzvernunft', icon: 'Scale' },
  { id: 'teil7', title: 'Teil VII: Dritte Kritik', subtitle: 'Ontologie des Relationalen', icon: 'Infinity' },
  { id: 'schluss', title: 'Schlussreflexion', icon: 'Sparkles' },
  { id: 'glossar', title: 'Glossar', icon: 'BookA' },
];

const output = {
  meta: {
    title: 'Die Digitale Transformation',
    subtitle: 'Eine poetisch-philosophische Trilogie mit theoretischer Grundlegung in drei Kritiken',
    author: 'Markus Oehring',
    date: 'März 2026',
    copyright: '© 2026 Markus Oehring. Alle Rechte vorbehalten.',
  },
  parts,
  chapters,
};

const outDir = path.join(ROOT, 'client', 'public');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.resolve(outDir, 'ebook_structured.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), { encoding: 'utf-8', flag: 'w' });
console.log(`Written ${chapters.length} chapters to ${outPath}`);
console.log('Parts:', parts.map(p => p.id).join(', '));
console.log('Chapters:', chapters.map(c => c.id).join(', '));
