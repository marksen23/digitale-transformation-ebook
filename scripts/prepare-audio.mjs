/**
 * prepare-audio.mjs
 *
 * Bereitet die Roh-TXT-Dateien der Bände für die Audio-Produktion vor:
 *   1. Entfernt PDF-Artefakte (Seitenkopfzeilen + Seitenzahlen)
 *   2. Bereinigt Sonderzeichen / Keilschrift-Glyphen
 *   3. Fügt natürliche Pause-Marker [PAUSE_S] / [PAUSE_L] ein
 *   4. Schreibt eine saubere Gesamt-TXT
 *   5. Schreibt einzelne Kapitel-TXT-Dateien
 *
 * Ausgabe: audio/ (relativ zum Projekt-Root)
 *
 * Verwendung:
 *   node scripts/prepare-audio.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "client", "public");
const OUT = join(ROOT, "audio");

// ──────────────────────────────────────────────────────────────
// Konfiguration
// ──────────────────────────────────────────────────────────────

const BAND_FILES = ["band1.txt", "band2.txt", "band3.txt"];

// Sonderzeichen → sprachlich sinnvoller Ersatz
const CHAR_MAP = [
  // Keilschrift-Götterzeichen (𒀭 = DINGIR)
  [/𒀭/g, ""],
  // Typografische Anführungszeichen → ASCII (für TTS-Klarheit)
  [/„/g, '"'],
  [/"/g, '"'],
  [/"/g, '"'],
  [/‚/g, "'"],
  [/'/g, "'"],
  [/'/g, "'"],
  // Gedankenstriche → einfacher Bindestrich mit Leerzeichen
  [/ – /g, " - "],
  [/ — /g, " - "],
  // Ellipsen
  [/…/g, "..."],
  // Nicht-brechende Leerzeichen
  [/\u00A0/g, " "],
  // Aufzählungszeichen
  [/^[•►▸★☆→←·]\s*/gm, "- "],
];

// Überschriften-Muster → Kapitelname + Pause-Klasse
const HEADING_PATTERNS = [
  { re: /^(BAND [IVX]+:?.*)$/m,  pause: "LONG",  prefix: "=== " },
  { re: /^(TEIL [IVX]+:?.*)$/m,  pause: "LONG",  prefix: "=== " },
  { re: /^(Prolog:.*)$/m,        pause: "MEDIUM", prefix: "--- " },
  { re: /^(Epilog:.*)$/m,        pause: "MEDIUM", prefix: "--- " },
  { re: /^(Kapitel \d+:.*)$/m,   pause: "MEDIUM", prefix: "--- " },
];

// SSML-Pause-Aliases (ElevenLabs / Azure Neural Voice)
const PAUSE = {
  SHORT:  "[PAUSE_S]",   // ~0.5 s  — nach Verszeile, Satzende
  MEDIUM: "[PAUSE_M]",   // ~1.5 s  — nach Absatz
  LONG:   "[PAUSE_L]",   // ~3.0 s  — nach Kapitelüberschrift / Band-Wechsel
};

// ──────────────────────────────────────────────────────────────
// Schritt 1: Dateien lesen & zusammenführen
// ──────────────────────────────────────────────────────────────

function readBands() {
  return BAND_FILES.flatMap((fname) => {
    const path = join(PUBLIC, fname);
    if (!existsSync(path)) {
      console.warn(`⚠  ${fname} nicht gefunden – wird übersprungen.`);
      return [];
    }
    return [readFileSync(path, "utf-8")];
  });
}

// ──────────────────────────────────────────────────────────────
// Schritt 2: PDF-Artefakte entfernen
//   Muster:  "DIE DIGITALE TRANSFORMATION \n42 \n"
//   (Seitenkopf + Seitenzahl stehen je auf eigener Zeile)
// ──────────────────────────────────────────────────────────────

function stripPdfArtifacts(text) {
  // Entferne "DIE DIGITALE TRANSFORMATION" + optionales Leerzeichen am Zeilenende
  text = text.replace(/^DIE DIGITALE TRANSFORMATION\s*$/gm, "");
  // Entferne alleinstehende Seitenzahlen (1-3 Ziffern, allein auf der Zeile)
  text = text.replace(/^\d{1,3}\s*$/gm, "");
  return text;
}

// ──────────────────────────────────────────────────────────────
// Schritt 3: Sonderzeichen ersetzen
// ──────────────────────────────────────────────────────────────

function replaceSpecialChars(text) {
  for (const [pattern, replacement] of CHAR_MAP) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

// ──────────────────────────────────────────────────────────────
// Schritt 4: Mehrfach-Leerzeilen normalisieren
// ──────────────────────────────────────────────────────────────

function normalizeWhitespace(text) {
  // Mehr als 2 Leerzeilen → genau 2
  text = text.replace(/\n{3,}/g, "\n\n");
  // Führende/abschließende Leerzeilen
  text = text.trim();
  return text;
}

// ──────────────────────────────────────────────────────────────
// Schritt 5: Pause-Marker einfügen
// ──────────────────────────────────────────────────────────────

function insertPauseMarkers(text) {
  // Nach jeder Kapitelüberschrift: langer Pause-Marker
  for (const { re, prefix: _p, pause } of HEADING_PATTERNS) {
    const marker = PAUSE[pause];
    // Ersetze die Überschrift mit: Überschrift + Leerzeile + PAUSE + Leerzeile
    text = text.replace(
      new RegExp(re.source, "gm"),
      (match) => `\n\n${match}\n${marker}\n`
    );
  }

  // Nach jedem Absatz (Doppel-Leerzeile) einen mittleren Pause-Marker
  // — aber nur wenn kein LONG/MEDIUM schon folgt
  text = text.replace(/\n\n(?!\[PAUSE)/g, `\n${PAUSE.MEDIUM}\n\n`);

  return text;
}

// ──────────────────────────────────────────────────────────────
// Schritt 6: In Kapitel aufteilen (zeilenbasiert)
// ──────────────────────────────────────────────────────────────

// Gibt true zurück, wenn die Zeile eine Kapitelüberschrift ist.
// BAND/TEIL müssen in Großbuchstaben beginnen und kurz sein (≤120 Zeichen),
// um Fließtext-Sätze wie „Band I vollzieht genau diese Arbeit …" auszuschließen.
function isHeading(line) {
  const trimmed = line.trim();
  if (trimmed.length > 120) return false;          // Fließtext-Sätze sind länger
  if (/^BAND [IVX]+/u.test(trimmed)) return true;  // Großbuchstaben = Überschrift
  if (/^TEIL [IVX]+/u.test(trimmed)) return true;  // Großbuchstaben = Überschrift
  if (/^Prolog:/u.test(trimmed)) return true;
  if (/^Epilog:/u.test(trimmed)) return true;
  if (/^Kapitel \d+:/u.test(trimmed)) return true;
  return false;
}

function splitIntoChapters(text) {
  const lines = text.split("\n");
  const chapters = [];
  let currentHeading = "00_Vorbemerkung";
  let currentLines = [];
  let chapterIndex = 0;

  for (const line of lines) {
    if (isHeading(line)) {
      // Vorheriges Kapitel sichern
      const content = currentLines.join("\n").trim();
      if (content.length > 40) {
        chapters.push({ heading: currentHeading, index: chapterIndex, content });
        chapterIndex++;
      }
      currentHeading = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Letztes Kapitel
  const content = currentLines.join("\n").trim();
  if (content.length > 40) {
    chapters.push({ heading: currentHeading, index: chapterIndex, content });
  }

  return chapters;
}

// ──────────────────────────────────────────────────────────────
// Schritt 7: Dateinamen aus Überschrift erzeugen
// ──────────────────────────────────────────────────────────────

function toFileName(index, heading) {
  const slug = heading
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${String(index).padStart(2, "0")}_${slug}.txt`;
}

// ──────────────────────────────────────────────────────────────
// Hauptroutine
// ──────────────────────────────────────────────────────────────

function main() {
  console.log("📖  Lese Bände …");
  const rawTexts = readBands();
  if (rawTexts.length === 0) {
    console.error("❌  Keine Band-Dateien gefunden. Abbruch.");
    process.exit(1);
  }

  let combined = rawTexts.join("\n\n");

  console.log("🧹  Entferne PDF-Artefakte …");
  combined = stripPdfArtifacts(combined);

  console.log("🔡  Ersetze Sonderzeichen …");
  combined = replaceSpecialChars(combined);

  console.log("🔲  Normalisiere Leerzeilen …");
  combined = normalizeWhitespace(combined);

  console.log("⏸   Füge Pause-Marker ein …");
  const withPauses = insertPauseMarkers(combined);

  // Ausgabe-Verzeichnis — chapters/ vor jedem Lauf leeren
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const chaptersDir = join(OUT, "chapters");
  if (existsSync(chaptersDir)) {
    for (const f of readdirSync(chaptersDir)) unlinkSync(join(chaptersDir, f));
  } else {
    mkdirSync(chaptersDir);
  }

  // Gesamt-TXT ohne Pause-Marker (reines Lesescript)
  const cleanOut = join(OUT, "gesamtwerk_audio.txt");
  writeFileSync(cleanOut, combined, "utf-8");
  console.log(`✅  Gesamt-TXT:            ${cleanOut}`);

  // Gesamt-TXT mit Pause-Markern (für TTS-Engines)
  const pauseOut = join(OUT, "gesamtwerk_audio_pause.txt");
  writeFileSync(pauseOut, withPauses, "utf-8");
  console.log(`✅  Gesamt-TXT + Pausen:   ${pauseOut}`);

  // Einzelne Kapitel-Dateien
  console.log("✂️   Teile in Kapitel …");
  const chapters = splitIntoChapters(combined);
  for (const ch of chapters) {
    const fname = toFileName(ch.index, ch.heading);
    const fpath = join(chaptersDir, fname);
    const header = `${ch.heading}\n${"=".repeat(ch.heading.length)}\n\n`;
    writeFileSync(fpath, header + ch.content, "utf-8");
  }
  console.log(`✅  ${chapters.length} Kapitel-Dateien → ${chaptersDir}`);

  // Manifest
  const manifest = chapters.map((ch) => ({
    index: ch.index,
    heading: ch.heading,
    file: toFileName(ch.index, ch.heading),
    charCount: ch.content.length,
    wordCount: ch.content.split(/\s+/).filter(Boolean).length,
    estimatedMinutes: Math.ceil(ch.content.split(/\s+/).filter(Boolean).length / 130),
  }));
  const manifestPath = join(OUT, "chapter_manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`✅  Manifest:              ${manifestPath}`);

  // Zusammenfassung
  const totalWords = manifest.reduce((s, c) => s + c.wordCount, 0);
  const totalMin = manifest.reduce((s, c) => s + c.estimatedMinutes, 0);
  console.log(`\n📊  Statistik:`);
  console.log(`    Kapitel:       ${chapters.length}`);
  console.log(`    Wörter gesamt: ${totalWords.toLocaleString("de-DE")}`);
  console.log(`    Sprechzeit:    ca. ${Math.floor(totalMin / 60)} h ${totalMin % 60} min`);
  console.log(
    `    (Basis: 130 Wörter/Min. — bitte für Sprecher/TTS anpassen)\n`
  );
}

main();
