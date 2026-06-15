/**
 * dedup-corpus.ts — Einmal-Bereinigung der bereits angelagerten Dubletten.
 *
 * Die laufende Anlagerung ist an der Quelle gestoppt (server/lib/resonanzLog.ts
 * Ingest-Dedup). Dieses Skript räumt die schon vorhandenen exakten
 * Wiederholungen auf: gruppiert nach endpoint + anchor + normalisierter Frage,
 * behält je Gruppe den BESTEN Eintrag (kuratiert vor roh, bei Gleichstand den
 * ältesten = das Original) und löscht den Rest.
 *
 * SICHER per Default: Dry-Run (zeigt nur, was gelöscht würde). Löschen passiert
 * NUR mit `--apply` UND gesetztem ADMIN_TOKEN — und läuft über den gehärteten
 * Server-Endpoint /api/admin/delete-bulk (Tree einmal, Retry, ein Index-Write).
 *
 * Aufrufe:
 *   pnpm tsx scripts/dedup-corpus.ts                 # Dry-Run, alle Dubletten
 *   pnpm tsx scripts/dedup-corpus.ts --raw-only      # nur rohe Dubletten löschen (Dry-Run)
 *   ADMIN_TOKEN=… pnpm tsx scripts/dedup-corpus.ts --apply
 *   ADMIN_TOKEN=… pnpm tsx scripts/dedup-corpus.ts --apply --raw-only
 *
 * Env:
 *   ADMIN_TOKEN  (für --apply) — der Admin-Bearer-Token
 *   API_BASE     (optional)    — Default https://digitale-transformation-ebook.onrender.com
 */
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const INDEX_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public/resonanzen-index.json`;
const API_BASE = process.env.API_BASE ?? "https://digitale-transformation-ebook.onrender.com";

const APPLY = process.argv.includes("--apply");
const RAW_ONLY = process.argv.includes("--raw-only");

interface Entry { id: string; ts: string; endpoint: string; anchor: string; prompt: string; status: string }

const norm = (s: string) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const STATUS_RANK: Record<string, number> = { published: 3, approved: 2, pending: 1, raw: 0, rejected: -1 };
const rank = (s: string) => STATUS_RANK[s] ?? 0;

async function main() {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Index laden fehlgeschlagen: ${res.status}`);
  const idx = await res.json() as { entries: Entry[] };
  const entries = idx.entries ?? [];

  // Gruppieren nach endpoint + anchor + normalisierter Frage
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = `${e.endpoint}|${e.anchor}|${norm(e.prompt)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }

  const toDelete: Entry[] = [];
  let keptCurated = 0;
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    // Besten Keeper bestimmen: höchster Status-Rang, bei Gleichstand ältester ts
    list.sort((a, b) => (rank(b.status) - rank(a.status)) || a.ts.localeCompare(b.ts));
    const keep = list[0];
    if (rank(keep.status) >= 2) keptCurated++;
    for (const e of list.slice(1)) {
      // --raw-only: kuratierte Dubletten NICHT anfassen
      if (RAW_ONLY && (e.status === "approved" || e.status === "published")) continue;
      toDelete.push(e);
    }
  }

  console.log(`[dedup] ${entries.length} Einträge · ${[...groups.values()].filter(g => g.length > 1).length} Dubletten-Gruppen`);
  console.log(`[dedup] zu löschen: ${toDelete.length}${RAW_ONLY ? " (nur raw)" : ""}  ·  Korpus danach ~${entries.length - toDelete.length}`);
  const byEp: Record<string, number> = {};
  for (const e of toDelete) byEp[e.endpoint] = (byEp[e.endpoint] ?? 0) + 1;
  console.log("[dedup] nach Endpoint:", byEp);
  console.log("[dedup] Beispiele:", toDelete.slice(0, 8).map(e => `${e.id} (${e.endpoint}, ${e.status})`));

  if (!APPLY) {
    console.log("\n[dedup] DRY-RUN — nichts gelöscht. Mit `--apply` (und ADMIN_TOKEN) ausführen.");
    return;
  }

  const token = process.env.ADMIN_TOKEN;
  if (!token) { console.error("[dedup] ADMIN_TOKEN fehlt — Abbruch."); process.exit(1); }
  if (toDelete.length === 0) { console.log("[dedup] nichts zu löschen."); return; }

  // Über den gehärteten Bulk-Delete-Endpoint, in Chunks von 25
  const ids = toDelete.map(e => e.id);
  let ok = 0, fail = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const r = await fetch(`${API_BASE}/api/admin/delete-bulk`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { console.error(`[dedup] Chunk ${i / 25 + 1} HTTP ${r.status}:`, data); fail += chunk.length; continue; }
    const succeeded = (data.results ?? []).filter((x: { ok: boolean }) => x.ok).length;
    ok += succeeded; fail += chunk.length - succeeded;
    console.log(`[dedup] Chunk ${i / 25 + 1}: ${succeeded}/${chunk.length} gelöscht`);
  }
  console.log(`\n[dedup] FERTIG — ${ok} gelöscht, ${fail} fehlgeschlagen. Keeper je Gruppe behalten (${keptCurated} kuratierte Gruppen).`);
}

main().catch(err => { console.error("[dedup] FAILED:", err instanceof Error ? err.stack : err); process.exit(1); });
