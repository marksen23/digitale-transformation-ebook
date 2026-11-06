# Design: Live-Append und Index entkoppeln

**Status:** Entwurf (kein Code in diesem PR)  
**Datum:** 2026-11-06  
**Kontext:** Push-Konflikte im Workflow `Validate Resonanz-Korpus` entstehen, weil Render-Live-Append (`server/lib/indexUpdater.ts`) und der CI-Guardian dieselben generierten Artefakte unter `client/public/resonanzen-*.json` schreiben. Recovery in CI (#30 / Härte-PR) mildert Symptome; die Root-Cause ist die doppelte Schreibautorität.

## Ist-Zustand

| Pfad | Wer schreibt | Was |
|---|---|---|
| `content/resonanzen/raw/**/*.md` | `server/lib/resonanzLog.ts` (Live-Append) | neue KI-Begegnungen, Status `raw` |
| `client/public/resonanzen-index.json` | `indexUpdater.appendToIndex` / `updateMany` / `removeMany` **und** CI `build-resonanzen-index.ts` | Index |
| weitere `resonanzen-*.json`, Embeddings, PDF | nur CI | Full-Rebuild |
| Auslieferung Index | `server/lib/rawAssets.ts` (GitHub-Raw, TTL 5 min) → Fallback `express.static` | Live ohne Redeploy |

Admin-Curate/Pre-Score/Delete mutieren den Index ebenfalls live (`updateManyInIndex` / `removeManyFromIndex`), damit Statuswechsel sofort sichtbar sind.

## Zielbild

1. **Nur CI** schreibt generierte `client/public/resonanzen-*.json` (und verwandte Artefakte).
2. **Live-App** committet nur Markdown unter `content/resonanzen/raw/...` (plus ggf. Frontmatter-Status in denselben Dateien).
3. Neue Einträge bleiben **bis zum nächsten CI-Lauf** in der App sichtbar — ohne Index-PUT von Render.

## Optionen

### Option A — Markdown-only Live-Append + Server-Overlay (empfohlen)

**Idee:** `appendToIndex` entfällt. Der Server liefert den CI-Index (weiter via `rawAssets`) und **merged zur Laufzeit** Einträge aus noch nicht indexierten Raw-Markdown-Dateien.

**Sichtbarkeit bis CI:**

1. Index aus GitHub-Raw laden (TTL wie heute).
2. Zusätzlich: GitHub Contents/Trees API (oder gecachter Manifest-Endpoint) listet `content/resonanzen/raw/**` neuer als `index.generatedAt` bzw. IDs, die nicht in `entries[]` stehen.
3. Diese Dateien parsen (Frontmatter + Body → IndexEntry-Shape, ohne Embeddings/`related`).
4. Overlay vorne an `entries` hängen; Response-Header z. B. `X-Index-Overlay: N`.

**Admin-Statuswechsel:** nur Frontmatter in der MD-Datei ändern (bereits Teil der Curate-Pipeline) — **kein** Index-PUT. Overlay bzw. nächster CI-Lauf trägt den Status. Delete: MD löschen/archivieren; Overlay filtert fehlende IDs.

**Vorteile:** Race CI↔Live auf JSON verschwindet; Korpus-Wahrheit = Markdown + CI-Artefakte.  
**Nachteile:** Overlay-Komplexität, GitHub-API-Rate-Limits, kurze Inkonsistenz bei Scores/`related` bis CI; Embeddings für brandneue Raw-Einträge fehlen bis Rebuild (Lexical-Fallback ok).

**Aufwand:** mittel–groß (Server + Tests + Admin-Pfade + CLAUDE.md). Sinnvolle Teilschritte: (1) Feature-Flag `LIVE_INDEX_WRITES=0`, (2) Overlay read-only, (3) Curate ohne Index-PUT, (4) `appendToIndex` entfernen.

### Option B — Markdown-only, Sichtbarkeit erst nach CI

Kein Overlay. Neue Raw-Einträge erscheinen in `/resonanzen` erst nach erfolgreichem Guardian-Push (typisch 1–3 min, bei Queue länger).

**Vorteile:** minimaler Code.  
**Nachteile:** spürbare Latenz; Admin sieht neue Raw-Einträge in Listen ggf. verzögert — widerspricht heutiger UX.

### Option C — Live behält Index-Append, CI schreibt Index nicht bei reinem Append-Trigger

Unzuverlässig: CI muss Embeddings/`related`/Questions trotzdem bauen; „Index nicht committen“ spaltet Artefakte. **Nicht empfohlen.**

### Option D — Queue/Worker statt GitHub-Contents-PUT

Live schreibt nur MD; ein dedizierter Bot-Job merged Index asynchron. Im Kern = Option A mit anderem Transport. Höherer Ops-Aufwand (Coolify/VPS-Migration beachten).

## Empfohlener Weg

**Option A in Stufen**, hinter Feature-Flag:

1. Doku + Flag (dieser Entwurf).
2. Overlay-MVP: nur `append`-Lücke schließen (IDs in raw/, nicht im Index).
3. Curate/Delete ohne Index-Mutation; Health-Counters umbauen.
4. `appendToIndex` / Index-PUTs default-aus; Monitoring über `/admin/health`.
5. Nach Stabilität: tote Index-Schreibpfade entfernen.

Abhängigkeit zur CI-Härte (Recovery + Re-Validate nach Reset): parallel sinnvoll — Recovery bleibt als Sicherheitsnetz, bis A vollständig ausgerollt ist; danach sollten generierte Konflikte selten bis nie auftreten.

## Risiken / offene Entscheidungen

| Thema | Frage an Markus |
|---|---|
| Latenz-Toleranz | Overlay (A) vs. Warten auf CI (B)? |
| Admin-Sofortigkeit | Muss Curate/Delete ohne CI-Wartezeit im UI greifen? |
| GitHub-API | PAT-Quota für Overlay-Listing vs. eigener Manifest-Commit nur mit MD-SHA-Liste |
| Coolify-Migration | Overlay gegen GitHub-Raw beibehalten oder lokales FS auf dem VPS lesen? |
| RAG | Dürfen brandneue Raw-Einträge ohne Embedding erst nach CI retrievebar sein? |

## Betroffene Dateien (bei Umsetzung)

- `server/lib/indexUpdater.ts`, `server/lib/resonanzLog.ts`, `server/lib/rawAssets.ts`
- Admin-Routen Curate/Delete/Pre-Score
- `client/src/lib/resonanzenIndex.ts` (falls Client direkt merged)
- `.github/workflows/validate-corpus.yml` (Trigger unverändert über `content/resonanzen/**`)
- `CLAUDE.md` Pipeline-Diagramm + Fallstricke
- Tests: `server/__tests__/`, ggf. Overlay-Unit-Tests

## Nicht-Ziele dieses Entwurfs

- Force-Push-Strategien oder „ours“-Merges auf generierten JSONs
- Abschalten der CI-Embeddings
- Domain-/Coolify-Cutover selbst
