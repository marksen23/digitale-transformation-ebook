/**
 * generate-timestamps.mjs
 *
 * Transkribiert MP3-Audiodateien via OpenAI Whisper und extrahiert
 * wortgenaue Timestamps als JSON.
 *
 * Ausgabe: client/public/audio/timestamps/{chapterId}.json
 * Format:  [{"w":"Wort", "s":0.0, "e":0.35}, …]
 *
 * Voraussetzungen:
 *   - OPENAI_API_KEY in .env oder Umgebungsvariable
 *   - MP3-Dateien in client/public/audio/male/ oder /female/
 *   - pnpm add -D openai (falls nicht vorhanden)
 *
 * Verwendung:
 *   node scripts/generate-timestamps.mjs [male|female] [chapterId]
 *
 * Beispiele:
 *   node scripts/generate-timestamps.mjs female band1-kap1
 *   node scripts/generate-timestamps.mjs male          # alle Kapitel
 *   node scripts/generate-timestamps.mjs               # alle Stimmen, alle Kapitel
 *
 * Hinweis: Timestamps sind stimme-unabhängig wenn der Text identisch ist.
 * Das Script erzeugt eine gemeinsame Timestamps-Datei pro Kapitel.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const PUBLIC    = join(ROOT, 'client', 'public');
const AUDIO_DIR = join(PUBLIC, 'audio');
const TS_DIR    = join(AUDIO_DIR, 'timestamps');

// Lade .env manuell (kein dotenv nötig)
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌  OPENAI_API_KEY nicht gesetzt. Script abbruch.');
  process.exit(1);
}

// Lazy-Import von openai (muss installiert sein)
async function getOpenAI() {
  try {
    const { default: OpenAI } = await import('openai');
    return new OpenAI({ apiKey: OPENAI_API_KEY });
  } catch {
    console.error('❌  Paket "openai" nicht gefunden. Bitte: pnpm add -D openai');
    process.exit(1);
  }
}

if (!existsSync(TS_DIR)) mkdirSync(TS_DIR, { recursive: true });

// ─── Argumente ────────────────────────────────────────────────

const [,, voiceArg, idArg] = process.argv;
const voices = ['male', 'female'];
const targetVoices = voiceArg && voices.includes(voiceArg) ? [voiceArg] : voices;

// ─── Kapitel-Dateien sammeln ──────────────────────────────────

function getChapterFiles(voice) {
  const dir = join(AUDIO_DIR, voice);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => extname(f) === '.mp3')
    .map(f => ({ voice, chapterId: basename(f, '.mp3'), file: join(dir, f) }));
}

// ─── Whisper-Transkription ────────────────────────────────────

async function transcribeFile(openai, filePath, chapterId) {
  const outPath = join(TS_DIR, `${chapterId}.json`);

  if (existsSync(outPath)) {
    console.log(`  ⏭   ${chapterId} — Timestamps vorhanden, übersprungen.`);
    return;
  }

  console.log(`  🎙  ${chapterId} — Transkribiere …`);

  const { createReadStream } = await import('fs');
  const stream = createReadStream(filePath);

  try {
    const result = await openai.audio.transcriptions.create({
      file: stream,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
      language: 'de',
    });

    // Whisper gibt words[] im verbose_json Format zurück
    const words = (result.words || []).map(w => ({
      w: w.word.trim(),
      s: Math.round(w.start * 1000) / 1000,
      e: Math.round(w.end   * 1000) / 1000,
    })).filter(w => w.w.length > 0);

    writeFileSync(outPath, JSON.stringify(words), 'utf-8');
    console.log(`  ✅  ${chapterId} — ${words.length} Wörter gespeichert → ${outPath}`);
  } catch (err) {
    console.error(`  ❌  ${chapterId} — Fehler: ${err.message}`);
  }
}

// ─── Hauptroutine ─────────────────────────────────────────────

async function main() {
  const openai = await getOpenAI();

  for (const voice of targetVoices) {
    const files = getChapterFiles(voice);
    if (!files.length) {
      console.log(`⚠   Keine MP3-Dateien in audio/${voice}/ gefunden.`);
      continue;
    }

    const targets = idArg ? files.filter(f => f.chapterId === idArg) : files;
    if (!targets.length) {
      console.log(`⚠   Kapitel "${idArg}" nicht in audio/${voice}/ gefunden.`);
      continue;
    }

    console.log(`\n📢  Stimme: ${voice} — ${targets.length} Kapitel`);

    for (const { file, chapterId } of targets) {
      await transcribeFile(openai, file, chapterId);
      // Rate-Limiting: kurze Pause zwischen Requests
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n✅  Fertig. Timestamps in:', TS_DIR);
}

main().catch(console.error);
