#!/usr/bin/env node
/**
 * Bereinigt ebook_content.md:
 * 1. Entfernt "DIE DIGITALE TRANSFORMATION" + Seitenzahl-Artefakte
 * 2. Verbindet mehrzeilige Überschriften
 * 3. Entfernt Nummerierungspräfixe (1., 1.1, 2., etc.) von Überschriften
 * 4. Konvertiert erkannte Überschriften in Markdown-Syntax (### / ####)
 *
 * Ausführen: node scripts/fix-headings.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'client', 'public', 'ebook_content.md');

let text = readFileSync(filePath, 'utf-8');

// ── 1. Seitenkopf-Artefakte entfernen ──────────────────────────
// Muster: "\nDIE DIGITALE TRANSFORMATION \n<seitenzahl> \n"
text = text.replace(/\n\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '\n');
// Am Dateianfang
text = text.replace(/^\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '');

// ── 2. Mehrzeilige nummerierte Überschriften zusammenführen ─────
// Muster: "X.Y Titel...\nFortsetzung" → "X.Y Titel... Fortsetzung"
// Erkennung: Zeile beginnt mit "N. " oder "N.N ", nächste Zeile ist kurz und
// beginnt klein (= Fortsetzung der Überschrift)
const lines = text.split('\n');
const merged = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();

  // Nummerierte Überschrift? (z.B. "2.1 Das transformative Dritte: Strukturcharakteristika und")
  // Nur 1-9 (höhere Nummern wie "20. Jahrhundert" sind Fließtext)
  const numMatch = trimmed.match(/^([1-9]\.(?:\d+)?)\s+(.+)/);
  if (numMatch) {
    let heading = trimmed;
    // Prüfe ob nächste Zeile Fortsetzung der ÜBERSCHRIFT ist
    // Kriterien: kurz (< 40 Zeichen), keine Satzzeichen am Ende, kein neuer Absatz
    while (i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      if (!nextTrimmed || /^[1-9]\./.test(nextTrimmed)) break;
      // Kurzes Fragment (< 40 Zeichen) ohne Satzende → Fortsetzung der Überschrift
      // NICHT wenn es ein vollständiger Satz ist (enthält ". " oder endet mit ".")
      if (nextTrimmed.length < 40 && !nextTrimmed.endsWith('.') && !nextTrimmed.includes('. ')) {
        heading += ' ' + nextTrimmed;
        i++;
      } else {
        break;
      }
    }
    merged.push(heading);
  } else {
    merged.push(line);
  }
  i++;
}
text = merged.join('\n');

// ── 3. Nummerierte Überschriften zu Markdown-Heading konvertieren ──
// Nur Nummern 1-9 (die echten Abschnitts-Überschriften im Werk)
// Höhere Nummern (20., 100.) sind Fließtext (z.B. "20. Jahrhundert")
// Unterüberschriften zuerst (spezifischer): "1.1 Titel" → "#### Titel"
text = text.replace(/^([1-9])\.([0-9]+)\s+(.+)$/gm, (_, _major, _minor, title) => {
  return `#### ${title.trim()}`;
});
// Hauptüberschriften: "1. Titel" → "### Titel"
text = text.replace(/^([1-9])\.\s+(.+)$/gm, (_, _num, title) => {
  return `### ${title.trim()}`;
});

// ── 4. Leerzeilen um Markdown-Headings sicherstellen ──────────
// Damit der Parser sie als eigenständige Absätze erkennt
text = text.replace(/([^\n])\n(#{3,4}\s)/g, '$1\n\n$2');  // Leerzeile VOR Heading
text = text.replace(/(#{3,4}\s.+)\n([^#\n])/g, '$1\n\n$2'); // Leerzeile NACH Heading

// ── 5. Dreifache+ Leerzeilen auf doppelte reduzieren ───────────
text = text.replace(/\n{3,}/g, '\n\n');

// ── 5. Schreiben ──────────────────────────────────────────────
writeFileSync(filePath, text, 'utf-8');

// Stats
const headings3 = (text.match(/^### /gm) || []).length;
const headings4 = (text.match(/^#### /gm) || []).length;
const pageHeaders = (text.match(/DIE DIGITALE TRANSFORMATION/g) || []).length;
console.log(`✓ Bereinigung abgeschlossen:`);
console.log(`  → ${headings3} Hauptüberschriften (###)`);
console.log(`  → ${headings4} Unterüberschriften (####)`);
console.log(`  → ${pageHeaders} verbleibende Seitenkopf-Artefakte`);
