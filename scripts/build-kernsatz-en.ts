/**
 * Baut die englischen Kernsatz-Übersetzungen aus content/i18n/kernsaetze.en.json.
 * Kein Laufzeit-Aufruf von /api/translate. Die Datei ist eine Übersetzung,
 * nicht die Stimme des Werks.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "content/i18n/kernsaetze.en.json");
const germanPath = path.join(root, "client/public/resonanzen-erkenntnisse.json");
const outPath = path.join(root, "client/public/resonanzen-erkenntnisse-en.json");

interface GermanFile { erkenntnisse?: Array<{ id: string; kernsatz: string }> }
interface SourceFile { items?: Array<{ id: string; text: string }> }

const german = JSON.parse(fs.readFileSync(germanPath, "utf8")) as GermanFile;
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as SourceFile;
const byId = new Map((source.items ?? []).map(item => [item.id, item.text.trim()]));
const missing: string[] = [];
const items = (german.erkenntnisse ?? []).map(entry => {
  const text = byId.get(entry.id);
  if (!text) {
    missing.push(entry.id);
    return null;
  }
  return { id: entry.id, text, translated: true as const, sourceLang: "de" as const };
}).filter((item): item is NonNullable<typeof item> => item !== null);

if (missing.length) {
  console.error(`[kernsatz-en] fehlende Übersetzungen: ${missing.join(", ")}`);
  process.exit(1);
}

const payload = {
  generatedAt: new Date().toISOString(),
  kind: "translation",
  sourceLang: "de",
  note: "Englische Übersetzungen der Kernsätze. Nicht die Stimme des Werks.",
  items,
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
console.log(`[kernsatz-en] ${items.length} Übersetzungen`);
