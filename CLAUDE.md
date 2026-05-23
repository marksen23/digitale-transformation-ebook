# Resonanzvernunft — Digitale Transformation

Ein deutsches Philosophie-eBook mit interaktivem Begriffsnetz, semantischer
Korpus-Suche und KI-gestütztem Dialog. Diese Datei ist das Bindeglied für
neue Claude-Sessions — egal ob Desktop, Web (claude.ai/code) oder Mobile.

---

## TL;DR Tech-Stack

- **Frontend**: React 19 + TypeScript + Vite (PWA via vite-plugin-pwa)
- **Backend**: Express (auf Render gehostet) — nur API-Endpunkte
- **Hosting-Topologie**:
  - **Netlify** hostet das Frontend (`dist/public`) — `digitale-transformation-ebook.netlify.app`
  - **Render** hostet den Server — `digitale-transformation-ebook.onrender.com`
  - Netlify proxied `/api/*` zu Render (siehe `netlify.toml`)
- **KI-Backends**: Anthropic Claude (Endpoints), Google Gemini (Embeddings)
- **Korpus-Store**: Markdown-Files unter `content/resonanzen/raw/`, plus
  generierte Indices unter `client/public/resonanzen-*.json`
- **CI**: GitHub Actions (`.github/workflows/validate-corpus.yml`) baut Index +
  Embeddings nach jedem KI-Eintrag.

---

## Häufige Tasks

### Build / Run lokal

```bash
pnpm install
pnpm dev                  # Vite Dev-Server auf :3000
pnpm check                # TypeScript strict-check ohne Emit
pnpm build                # Full: Index + Frontend + Server
pnpm build:server         # Nur Server-Bundle (für Render)
pnpm build:resonanzen-index   # Nur Index-Rebuild
```

### Tests

Es gibt aktuell keine zentrale Test-Suite (Vitest installiert aber unbenutzt).
`pnpm check` (= `tsc --noEmit`) ist der primäre Quality-Gate.

---

## Architektur in einer Folie

```
Browser (Netlify)                  Render-Server (Express)
─────────────────                  ───────────────────────
 React SPA                          POST /api/path-analyse
  │  Klick KI-Tool                  POST /api/analyse
  ▼                                 POST /api/graph-chat
 fetch /api/...                     POST /api/enkidu/*
  │                                 ─────────────────────
  └─proxy─────────────►            ▼
                                    Claude API
                                    Gemini API (Embeddings)
                                    │
                                    ▼
                                    GitHub Contents API:
                                    – content/resonanzen/raw/{endpoint}/.../{id}.md
                                    – client/public/resonanzen-index.json
                                    (Live-Append, schreibt incrementell)

                                    GitHub Action validate-corpus.yml:
                                    – Volle Index- + Embedding-Rebuild
                                    – Cross-Links, near-duplicates, holdout
                                    – snapshot-commit von corpus-guardian-bot
```

---

## Kritische Env-Variablen

| Variable | Wo gesetzt | Pflicht? | Sym­ptome wenn falsch |
|----------|-----------|----------|------------------|
| `GEMINI_API_KEY` | Render Env, GitHub Repo-Secrets | ja | Keine Embeddings; bei CI: rote Action mit „FATAL 0 erfolgreiche Embedding-Calls" |
| `GITHUB_TOKEN` (PAT mit `repo` scope) | Render Env | ja für Live-Append | Server-Logs: `[resonanzLog] skipped (no token)`. KI-Outputs landen nicht im Korpus. Heartbeat auf `/admin/health` zeigt `githubTokenPresent: false`. |
| `ANTHROPIC_API_KEY` | Render Env | ja | 500-Fehler bei jeder KI-Anfrage |
| `EMBEDDINGS_REQUIRED` | nur im CI gesetzt (Workflow-YAML) | nein | Wenn 1 + 0 Embeddings: Workflow rot. Wenn 0/leer: Soft-warn auf Netlify-Build. |
| `GEMINI_EMBED_MODEL` | optional ENV-Overwrite | nein | Default `gemini-embedding-001`. Falls Google das Modell deprecaten: hier umschalten ohne Code-Change. |

---

## Bekannte Fallstricke + Diagnose-Pfade

### 1. „Embeddings fehlen auf /admin/health" oder „Diagnose-Banner zeigt Gemini-Key fehlt"

**Diagnose-Reihenfolge:**

1. `curl -s https://digitale-transformation-ebook.netlify.app/resonanzen-index.json | head -c 200`
   - Wenn `count` < aktueller Korpus-Größe ODER `generatedAt` älter als ein Tag: **Netlify hat veraltetes File**. Siehe Punkt 4.
2. `curl -s -o /dev/null -w "%{size_download}\n" https://digitale-transformation-ebook.netlify.app/resonanzen-embeddings.json`
   - Wenn < 1000 Bytes: leerer Stub. CI hat noch nie erfolgreich Embeddings committed. Action-Log prüfen.
3. Falls Live + komittiert OK: Browser-Cache + Service-Worker-Cache reset (PWA-Cache hält die alte Datei).

### 2. „KI-Outputs werden nicht in den Korpus übernommen" (Live-Append broken)

Symptom: KI-Endpoint antwortet User korrekt, aber kein neuer `log(resonanz):` Commit auf GitHub.

**Diagnose:**

1. `/admin/health` (live, Token) → Block „Resonanz-Health":
   - `githubTokenPresent`: false → PAT in Render-Env fehlt/expired
   - `successCount` stagniert: KI-Calls erreichen Server gar nicht
   - `failureCount` steigt + `lastFailure.reason: "401 Bad credentials"`: PAT ungültig/expired
   - `failureCount` steigt + `lastFailure.reason: "403 ..."`: PAT-Scope fehlt (`repo` braucht's)
2. Render Dashboard → Service → **Environment** → `GITHUB_TOKEN` setzen mit frisch erzeugtem PAT (https://github.com/settings/tokens, Scope `repo`)
3. Service muss redeployt werden, damit neue ENV greift

### 3. „CI-Workflow grün, aber kein Snapshot-Commit auf main"

Häufigste Ursache: `git pull --rebase` scheitert mit unstaged files. Siehe
`.github/workflows/validate-corpus.yml` — der Commit-Step muss ALLE
Build-Artefakte adden vor dem rebase, oder `--autostash` benutzen.

### 4. „Netlify deployt nicht / serviert alte Daten"

Häufige Ursache: **Production branch** in Netlify auf falschen Branch gesetzt
(z. B. `claude/<irgendwas>` statt `main`). Check unter Netlify → Site
configuration → Build & deploy → Continuous deployment → **Branches and
deploy contexts**. Plus: prüfen ob Split Testing aktiv ist.

### 5. „Render-Build timed out"

Render's `buildCommand` darf **nicht** `npm run build` sein (das ruft auch
den Index-Build mit Gemini-Calls auf, ~100s). Render braucht nur den
Server-Bundle:

```yaml
buildCommand: npm install --legacy-peer-deps && npm run build:server
```

---

## Korpus-Datenfluss

```
KI-Endpoint (POST /api/analyse)
  → Render-Server generiert KI-Antwort
  → server/lib/resonanzLog.ts schreibt Markdown nach GitHub
     (content/resonanzen/raw/{endpoint}/{anchor}/{date}-{id}.md)
  → server/lib/indexUpdater.ts hängt minimalen Eintrag an
     client/public/resonanzen-index.json an (ohne Embeddings)
  → Push auf main triggert .github/workflows/validate-corpus.yml
     → scripts/build-resonanzen-index.ts (FULL rebuild)
        - Holt alle MD-Files via GitHub-Tree-API
        - Berechnet Embeddings via Gemini (gemini-embedding-001, 3072-dim)
        - computeCrossLinks(): related[], nearDuplicates[], werkVoiceScore, corpusVoiceScore
        - Hold-out-Check (Anti-Drift-Mechanismus)
     → Commit von corpus-guardian-bot zurück auf main
  → Netlify rebuilds Frontend mit neuem Index → Live
```

`werkVoiceScore` braucht ≥10 Einträge mit `status: approved`/`published`. Aktuell nur 3 — daher 0/136 mit werkVoiceScore.

---

## Wichtige Datei-Pfade

- `client/src/components/` — Design-System-Komponenten (SectionLabel,
  CategoryLegendButton, FocusOverlay, ResonanzCard, ResonanzenBlock,
  LegendSection, ToolOutputPanel, InstallButton, AppFrame, etc.)
- `client/src/pages/ConceptGraphPage.tsx` — das Begriffsnetz (~3400 Zeilen,
  ein bewusst dichter Monolith mit eigenem SVG-Renderer)
- `client/src/pages/ResonanzenPage.tsx` — Korpus-Browser („Wissen")
- `client/src/pages/admin/AdminHealthPage.tsx` — Health-Dashboard
- `server/index.ts` — Express-Hauptdatei mit allen Endpunkten
- `server/lib/resonanzLog.ts` — GitHub-Write für rohe MD-Einträge
- `server/lib/indexUpdater.ts` — Inkrementeller Index-Append
- `server/lib/echoDetector.ts` — At-Ingest-Cosine-Vergleich gegen bestehende
- `server/lib/embeddingClient.ts` — Shared Gemini-Embedding-Client
- `scripts/build-resonanzen-index.ts` — Full-Rebuild-Skript (CI + lokal)
- `scripts/validate-resonanzen.ts` — Schema-/Anchor-/Hash-Wächter
- `scripts/check-corpus-drift.ts` — Aggregat-Drift-Detector

---

## Konventionen

- **TypeScript strict**, kein `any` außer in Detection-Code (Browser-Sniffing
  o. ä.). `pnpm check` muss vor jedem Commit grün sein.
- **Deutsche Comments + UI-Strings.** Code-Identifier englisch.
- **Inline Styles** in den Begriffsnetz-Komponenten (kein CSS-Module) —
  Konsequenz aus dem typografischen Maßwerk-Stil.
- **Tailwind v4** für utilities, aber die meisten kritischen Komponenten
  haben eigene inline-Token-Lookups (`client/src/lib/theme.ts`).
- **Commit-Stil**: `feat(...)`, `fix(...)`, `refactor(...)`, `chore(...)`,
  `diag(...)`, `docs(...)`. Co-Authored-By: Claude wenn Claude beteiligt.
- **Worktree-Push-Pattern**: Claude arbeitet meist in
  `.claude/worktrees/<random>/` und pusht direkt mit
  `git push origin <worktree-branch>:main`. Der `claude/...`-Branch auf
  origin existiert evtl. nicht oder ist veraltet — **Netlify Production
  Branch MUSS auf `main` stehen.**

---

## Live-URLs

- Produktion: <https://digitale-transformation-ebook.netlify.app>
- API: <https://digitale-transformation-ebook.onrender.com> (proxied via `/api/*`)
- Repo: <https://github.com/marksen23/digitale-transformation-ebook>
- Health: <https://digitale-transformation-ebook.netlify.app/admin/health>
  (Admin-Token erforderlich — Aufruf via `?token=...` einmal initial)

---

## Wenn diese Session in eine neue (mobile / web / desktop) übergibt

Sage einfach „lies CLAUDE.md und mach weiter" — der Stand des Projekts ist
das, was auf `origin/main` liegt. Was offen ist, steht in **TODO** oder in
GitHub-Issues. Was kürzlich gefixt wurde, steht im `git log` der letzten 20
Commits.

Aktuell (Stand des letzten Commits in dieser Datei): siehe `git log -10` für
den Bilanz-Status der letzten Embedding/CI/Netlify/Render-Fixes.
