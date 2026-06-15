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
| `GEMINI_API_KEY` | Render Env, GitHub Repo-Secrets | ja | Keine Embeddings; bei CI: rote Action mit „FATAL 0 erfolgreiche Embedding-Calls". Bei `403 dunning / PERMISSION_DENIED`: GCP-Projekt-Billing gesperrt → `GEMINI_API_KEY_FALLBACK` setzen. |
| `GEMINI_API_KEY_FALLBACK` | Render Env, GitHub Repo-Secrets | nein | Zweiter Key auf anderem GCP-Projekt (eigenes Billing). Der shared `embeddingClient` rotiert automatisch darauf, wenn der Primärkey billing/auth-blockiert ist. SELBES Modell → vektorkompatibel. Auch Komma-Liste via `GEMINI_API_KEYS` möglich. |
| `GITHUB_TOKEN` (PAT mit `repo` scope) | Render Env | ja für Live-Append | Server-Logs: `[resonanzLog] skipped (no token)`. KI-Outputs landen nicht im Korpus. Heartbeat auf `/admin/health` zeigt `githubTokenPresent: false`. |
| `ANTHROPIC_API_KEY` | Render Env | ja | 500-Fehler bei jeder KI-Anfrage |
| `EMBEDDINGS_REQUIRED` | nur im CI gesetzt (Workflow-YAML) | nein | Wenn 1 + 0 Embeddings: Workflow rot. Wenn 0/leer: Soft-warn auf Netlify-Build. |
| `GEMINI_EMBED_MODEL` | optional ENV-Overwrite | nein | Default `gemini-embedding-001`. Falls Google das Modell deprecaten: hier umschalten ohne Code-Change. |
| `AUTO_CURATE_*` | optional Render Env | nein | Schwellen für `/api/admin/auto-curate`: `AI_MIN` (4), `CORPUS_MIN` (0.55), `AI_REJECT` (2), `CORPUS_REJECT` (0.30), `WERK_MIN` (0.55), `CONCEPT_MIN` (0.68), `CONCEPT_REJECT` (0.62). Niedriger = aggressivere Auto-Freigabe. Default konservativ. `CONCEPT_*` = dritter (Begriffs-)Anker des triangulierten Schutzwalls. |
| `CONCEPT_NEW_*` | optional Render Env | nein | Schutzwall für **neue Begriffe** (`/api/admin/propose-concept`, Phase 5c): `DISTINCT_MIN` (0.10 — min. Distinktheit `1−maxCosine` zu bestehenden Begriffen, kein Beinah-Duplikat), `EVIDENCE_SIM` (0.70 — Cosine-Schwelle, ab der eine kuratierte Resonanz den Begriff „trägt"), `EVIDENCE_MIN` (1 — min. Anzahl tragender kuratierter Erkenntnisse). Höher = strenger. |

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

### 6. „Netlify-Deploy-Kosten explodieren / Gemini-Quota wird bei jedem Deploy verbraucht"

**Exakt derselbe Fehler wie #5, nur für Netlify.** Die `netlify.toml`-
`command` darf **nicht** `pnpm build` sein — das rechnet bei JEDEM Deploy
den ganzen Korpus + alle Embeddings (Gemini-Calls!) + das PDF neu, obwohl
die GitHub-Action das längst getan und die JSONs nach `client/public/`
committet hat. Netlify braucht nur den Frontend-Build:

```toml
[build]
  command = "pnpm install && pnpm build:frontend"   # = nur vite build
```

`vite` kopiert die committeten Korpus-JSONs aus `client/public/` nach
`dist/public` — kein Neurechnen nötig. Zusätzlich überspringt
`scripts/netlify-ignore.sh` (als `ignore =` in netlify.toml) Deploys ganz,
wenn ein Commit nichts Frontend-Relevantes ändert (nur `server/`,
`scripts/`, `content/`, `*.md`). Korpus-Daten-Updates unter
`client/public/*.json` deployen weiterhin. (Behoben 2026-06-08.)

### 7. „corpus-guardian-bot kann nicht auf main pushen (GH006 protected branch)"

Wenn `main` eine **Branch-Protection mit PR-Pflicht** hat (`required_pull_request_reviews`
+ `required_status_checks`), scheitert der CI-Commit-Step mit
`GH006: Protected branch update failed ... Changes must be made through a
pull request`. Der Bot nutzt den Actions-`GITHUB_TOKEN` (kein Admin) und ist
der PR-Pflicht unterworfen. **Admin/Owner-Pushes gehen durch** (`enforce_admins:
false`) — deshalb funktionieren manuelle Pushes, aber der Bot nicht.

Die ganze Auto-Pipeline (Live-Append, Tages-Snapshot, CI-Rebuild) ist auf
**direkte Bot-Pushes** ausgelegt — PR-Pflicht ist damit unvereinbar (niemand
reviewt jeden Snapshot). Fix (eine Variante wählen):

- **Empfohlen** — die zwei blockierenden Anforderungen entfernen, force-push-
  Schutz behalten:
  ```bash
  gh api -X DELETE repos/<owner>/<repo>/branches/main/protection/required_pull_request_reviews
  gh api -X DELETE repos/<owner>/<repo>/branches/main/protection/required_status_checks
  ```
  Oder per UI: Settings → Branches → `main`-Regel → Häkchen weg bei „Require a
  pull request" + „Require status checks", „Allow force pushes" aus lassen.
- **Strenger** — Workflow auf Admin-PAT-Push umbauen (PAT-Secret + `git push`
  mit dem PAT; Admin bypasst `enforce_admins: false`). Behält PR-Pflicht für
  Menschen.

Notfall-Workaround wenn Embeddings im Runner gebaut, aber nicht gepusht
wurden: Artifact `corpus-state` des Runs herunterladen
(`gh run download <id> -n corpus-state`), die JSONs nach `client/public/`
kopieren und per Owner-Push committen. (Aufgetreten 2026-06-08 nach
Billing-Reaktivierung.)

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
     → scripts/build-werk-chunks.ts (RAG-Chunks + Embeddings)
     → scripts/build-search-index.ts (concepts + philosophers Embeddings
        → client/public/{concepts,philosophers}-embeddings.json)
     → scripts/build-resonanzen-index.ts (FULL rebuild)
        - Holt alle MD-Files via GitHub-Tree-API
        - Berechnet Embeddings via Gemini (gemini-embedding-001, 3072-dim)
        - computeCrossLinks(): related[], nearDuplicates[], werkVoiceScore, corpusVoiceScore
        - Hold-out-Check (Anti-Drift-Mechanismus)
     → Commit von corpus-guardian-bot zurück auf main
        (braucht direkten Push-Zugriff — siehe Fallstrick #7)
  → Netlify rebuildet NUR das Frontend (vite, kein Korpus-Rebuild — siehe
     Fallstrick #6) und serviert die committeten JSONs → Live
  → Render redeployt NICHT (render.yaml buildFilters ignorieren client/**,
     content/**, scripts/**, *.md). Der Server liest werk-chunks +
     resonanzen-{index,embeddings}.json LIVE von GitHub-Raw mit TTL-Cache
     (werkRetrieval.ts: werk 60 min, resonanzen 10 min; lokale Platte =
     Fallback). Neue kuratierte Einträge erreichen den RAG also ohne
     Redeploy — Selbstlern-Loop schließt sich deploy-frei.
```

Alle Embeddings sind `gemini-embedding-001`, **3072-dim**. Ein Modellwechsel
erzeugt einen inkompatiblen Vektorraum → Re-Embed des ganzen Korpus nötig.
Vektorkompatibler Failover = zweiter Key auf anderem GCP-Projekt
(`GEMINI_API_KEY_FALLBACK`), SELBES Modell. Der shared `embeddingClient`
rotiert automatisch; Live-Status auf `/admin/health` → „Embedding-Pipeline"
(klassifiziert Billing-Block / Quota / Auth).

`werkVoiceScore` braucht ≥10 Einträge mit `status: approved`/`published`. Aktuell nur 3 — daher 0/136 mit werkVoiceScore.

**Chapter-Resonanzen-Policy (bewusst):** Einträge mit `endpoint: "chapter"`
(Kapitel-Q&A aus `/api/ask` im WerkPage) werden **ohne `nodeIds`** geloggt —
sie hängen an einem Kapitel (`anchor: chapter:<id>`), nicht an einem Begriff.
Das ist korrekt, **kein Bug**: sie tragen daher nichts zur Begriffsnetz-/
Landkarte-Gravitation bei (richtig — sie gehören an keinen Begriff). Erreichbar
bleiben sie im Korpus-Browser über den `endpoint`-Filter + Permalink. **Kein
künstliches nodeIds-Backfill** — das würde falsche Begriffs-Gravitation
erzeugen. `related[]`/`nearDuplicates[]` werden im Build (`computeCrossLinks`)
gegen `rejected` gefiltert und von `validate-resonanzen` (`danglingLinks`)
gegen den Index geprüft.

### Selbst-Erweiterung (RAG-Rückkopplung + Auto-Kuratierung)

Der Server-RAG (`server/lib/werkRetrieval.ts:125`) zieht **nur kuratierte**
Einträge (`approved`/`published`) als Kontext — `raw`/`rejected` werden
bewusst NICHT zurückgefüttert (Schutz vor Model-Collapse / Echo-
Verstärkung). Jede KI-Ausgabe wird zwar eingebettet + drift-geprüft +
cross-verlinkt, fließt aber erst nach Kuratierung in die KI-eigene RAG.

`POST /api/admin/auto-curate` (mode `preview`/`apply`) skaliert den
`raw → approved`-Schritt sicher: Gate = `ai_score` (Claude) +
`corpusVoiceScore` (Cosine zum **Buchtext** — Drift-Anker, der unabhängig
von der Korpus-Größe funktioniert und nicht mit der KI mitwandert) + kein
Echo + keine `novelty`. `werkVoiceScore` wird zusätzlich genutzt, sobald
≥10 kuratierte da sind. `preview` = read-only Vorschau, `apply` = bewertet
fehlende ai_scores nach + setzt Status (audit_trail `actor: "auto-curate"`).
Schwellen via `AUTO_CURATE_*`-ENV. UI: `/admin` → „Auto-Kuratierung".
Voll-automatischer Cron-Modus bewusst offen, bis `werkVoiceScore` verfügbar.

**Triangulierter Schutzwall (Phase 5):** Neben dem Werk-Prosa-Anker
(`corpusVoiceScore`) gibt es einen dritten, menschlich-autorisierten Anker:
`conceptVoiceScore` = max Cosine zur **Begriffsstruktur** des Begriffsnetzes
(`concepts-embeddings.json`). Frage: greift der Eintrag die *Begriffe + ihre
Relationen* (nicht nur den Wortlaut)? Berechnet im CI-Rebuild
(`build-resonanzen-index.ts:computeCrossLinks`, analog corpusVoiceScore),
`conceptAnchor` = nächstliegender Begriff. Im Gate ist er **korroborierend**
(härtet den Wall — Eintrag muss Prosa- UND Begriffs-Nähe zeigen), graceful bei
Abwesenheit. **Ehrlicher Befund** (`scripts/verify-concept-voice.mjs`, lokal
gegen die committeten Embeddings): aktuell korreliert er mit `corpusVoiceScore`
(Median-Differenz −0.06, **null** divergente begriffs-nah/prosa-fern-Fälle) —
er liberalisiert also (noch) nicht, sondern bestätigt. Die „unverfügbare
Entwicklung" (begriffs-nah, prosa-fern) ist damit **instrumentiert**: sobald
solche Einträge auftauchen, zeigt das Verify-Script sie, und der Anker kann von
korroborierend (AND) auf liberalisierend (OR) umgestellt werden.

**Wachsendes Netz (Phase 5b/5c):** Das Begriffsnetz selbst wächst durch
**Anlagerung**, nie durch Überschreiben — `conceptGraph.ts` (`NODES`/`EDGES`)
bleibt der handgesetzte kanonische Kern. Zwei additive, server-persistierte
JSON-Schichten lagern sich an:
- **Kanten** (5b): `client/public/concept-edges.json` — werdende Verbindungen aus
  der Landkarte, admin-erhoben (`server/lib/conceptEdges.ts`, `promoteEdge`).
- **Knoten** (5c): `client/public/concept-nodes.json` — neue Begriffe/
  Wortschöpfungen, admin-vorgeschlagen (`server/lib/conceptNodes.ts`,
  `/api/admin/propose-concept`). Schutzwall: **Distinktheit** (`1−maxCosine` zu
  bestehenden Begriffen) + **Korpus-Evidenz** (Zahl kuratierter Resonanzen, die
  den Begriff semantisch tragen) + menschliche Autorisierung. Position
  deterministisch am Anker-Begriff. `build-search-index.ts` embeddet neue
  Begriffe mit → `conceptVoiceScore` bezieht sie ein; `validate-resonanzen.ts`
  erkennt sie als gültige `nodeId`. Konsumenten (`ConceptGraphPage`,
  `LandkartePage`) mergen statisch + dynamisch (`client/src/lib/dynamicNodes.ts`).

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
- `server/lib/embeddingClient.ts` — Shared Gemini-Embedding-Client mit
  **Multi-Key-Failover** (`getKeys`, `classifyError`, Retry/Backoff,
  Key-Rotation) + `probeEmbedding()` für `/api/health`. EINZIGE Quelle für
  Embeddings — alle Scripts + `/api/embed` importieren von hier.
- `scripts/build-resonanzen-index.ts` — Full-Rebuild-Skript (CI + lokal)
- `scripts/build-werk-chunks.ts` — RAG-Chunk-Index (mit Preserve-on-failure)
- `scripts/build-search-index.ts` — concepts + philosophers Embeddings (Phase B)
- `scripts/validate-resonanzen.ts` — Schema-/Anchor-/Hash-Wächter
- `scripts/check-corpus-drift.ts` — Aggregat-Drift-Detector
- `scripts/netlify-ignore.sh` — Build-Ignore-Hook (überspringt Netlify-Deploys
  ohne Frontend-Relevanz — siehe Fallstrick #6)

### „Das wachsende Werk" — Roadmap-Feature-Flächen (Phasen 1–6, abgeschlossen)

Selbstlern-/Wachstums-Features. Alle **additiv**: kanonische Kerne (Buchtext,
`conceptGraph.ts` NODES/EDGES) bleiben unberührt, neue Erkenntnisse/Begriffe
lagern sich an.

- **Streaming (SSE, Phase 3):** alle vier KI-Flächen streamen token-weise.
  Server: additive Endpunkte `/api/{graph-chat,weiterdenken,analyse-cluster,
  analyse-path}/stream` + geteilter `server/lib/geminiStream.ts`
  (`streamGeminiSSE`). Client: `client/src/lib/sseClient.ts` (`consumeSSE`) +
  inline-Reader in ConceptGraphPage/WeiterdenkenThread. **KRITISCH:** SSE-Header
  `Cache-Control: no-store` (nicht `no-cache` — sonst cacht Netlify-Edge leere
  POST-Antworten). Citation- + Schlussfrage-Split laufen NACH Stream-Ende;
  automatischer Fallback auf die nicht-gestreamten JSON-Endpunkte.
- **Weiterdenken-Fäden (Phase 1):** `client/src/lib/threadStore.ts`
  (localStorage), `WeiterdenkenThread.tsx`, `closingQuestion.ts` (`splitClosing`).
  Speicher-/Wiederfind-UI in „Mein Werk" (`MeinWerkPage.tsx`).
- **Quellen-Footer (Phase 1):** `client/src/components/CitedSourcesFooter.tsx`
  (geteilt: Analyse/Pfad/Dialog/Weiterdenken).
- **Werk-Anschlussstellen (Phase 2):** Reader-Naht-Indikator in `WerkPage.tsx`
  via `contextMeta.werk_passages`; Kanon-Akkretion (kuratierte = „Weiterführungen").
- **Wissens-Landkarte (Phase 4):** `client/src/pages/LandkartePage.tsx` (Route
  `/landkarte`) — Begriffsnetz × Korpus, Korpus-Gravitation, werdende Verbindungen.
- **Wachsendes Netz (Phase 5b/5c):** Kanten — `server/lib/conceptEdges.ts` +
  `client/src/lib/promotedEdges.ts` (`concept-edges.json`); Knoten —
  `server/lib/conceptNodes.ts` + `client/src/lib/dynamicNodes.ts`
  (`concept-nodes.json`) + `components/admin/ProposeConceptPanel.tsx`
  (`/api/admin/propose-concept`). Schutzwall siehe Selbst-Erweiterungs-Abschnitt.
- **Lese-Komfort (Phase 6):** `client/src/lib/readingSettings.ts` + „Aa Lesen"-
  Regler in `WerkPage.tsx`.
- **Onboarding/A11y (Phase 6):** `OnboardingHint.tsx`; `theme.ts:accentText`
  (theme-bewusster WCAG-AA-Akzenttext: hell #b45309, dunkel #f59e0b); Skip-Link +
  globaler `:focus-visible` + `<main>` in AppFrame/index.css; Begriffsnetz-Knoten
  tastatur-fokussierbar (tabIndex/role/aria-label/Enter).

### Vereinheitlichte Suche (UnifiedSearch)

Eine gemeinsame Such-Architektur über alle Seiten (Reader, Begriffsnetz,
Philosophie, Wissen) + globales Cmd-K. Hybrid: lexikalisch sofort,
semantisch (Embedding) nach 300 ms — kein Toggle.

- `client/src/components/search/UnifiedSearch.tsx` — Hauptkomponente
  (ChipBuilder-Filter + Live-Dropdown + Tier-Sortierung primary/extended)
- `client/src/components/search/GlobalSearch.tsx` — Cmd-K-Overlay (im AppFrame)
- `client/src/hooks/useHybridSearch.ts` — Lex+Sem-Orchestrierung
- `client/src/lib/search/sources/*.ts` — pro Quelle ein Adapter (chapters,
  resonanzen, concepts, philosophers); `index.ts` = Barrel-Export
- `client/src/lib/search/queryEmbedding.ts` — Query-Embedding-Cache +
  Degradations-Tracking (zeigt Hinweis wenn Semantik ausfällt)

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
- **Prompt-Safety**: Nutzergesteuerter Text (Frage, Übersetzungstext,
  Chat-Message, Passagen-Impuls) wird via `server/lib/promptSafety.ts`
  (`wrapUntrusted` + `UNTRUSTED_RULE`) in `<USER_INPUT>`-Delimiter gerahmt;
  Begriffs-`description`/`fullLabel` in Cluster-Prompts werden
  **server-autoritativ** aus `nodeSrv` aufgelöst (nie Client-Text vertrauen).
- **Frontmatter-Parser**: EINE Quelle — `scripts/lib/frontmatter.ts`
  (CRLF-robust, von build + validate geteilt). Korpus-MDs sind via
  `.gitattributes` auf LF gepinnt.

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

Aktuell (Stand 2026-06-09): Die Roadmap **„Das wachsende Werk" (Phasen 1–6) ist
abgeschlossen und live** — siehe den gleichnamigen Datei-Pfade-Abschnitt für die
Feature-Flächen (Streaming, Weiterdenken-Fäden, Wissens-Landkarte, triangulierter
Schutzwall, wachsendes Netz/Kanten+Knoten, Kanon-Akkretion, Lese-Komfort/A11y/
Onboarding). Dazu: Render liest den Korpus live von GitHub-Raw (deploy-frei,
Fallstrick-Abschnitt #5/#6) und der Netlify-Frontend-Deploy hing zwischenzeitlich
am Billing (Fallstrick #4).

**Korpus-abhängige Reife:** Viele Wachstums-Features zeigen erst mit mehr
**kuratierten** Einträgen volle Wirkung (`werkVoiceScore` braucht ≥10; die
Landkarte-Gravitation, conceptVoiceScore-Evidenz und 5c-Begriffs-Evidenz skalieren
mit dem kuratierten Korpus — aktuell nur ~3 published). Nächster organischer
Schritt ist daher **Kuratierung** (`/admin` → Auto-Kuratierung/Bulk), nicht weiterer
Code. Offene Code-Optionen: `accentText` auf Admin-Seiten, Auto-Begriffs-Kandidaten
aus dem Korpus (5c-Erweiterung), Reset-Aktion im Wissen-Empty-State.

Was kürzlich passierte: siehe `git log -30` (Roadmap-Commits + die
Embedding/CI/Netlify/Render-Fixes).
