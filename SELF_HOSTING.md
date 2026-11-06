# Self-Hosting mit Docker (Coolify, VPS, Raspberry Pi 400)

Das Image läuft **parallel** zum bestehenden Render-Dienst. `render.yaml` bleibt
die Quelle für den Render-Build (Befehl, Node `22.13.0`, Start `node dist/index.js`).
Dieses Setup wiederholt dieselben Schritte in einem schlanken Mehrstufen-Image
und ändert das Render-Verhalten nicht.

Gebaut wird **nicht** `pnpm build`. Der volle Build würde Korpus-Index,
Embeddings und PDF mit Gemini-Calls neu rechnen. Das bleibt die GitHub-Action.
Das Image macht, wie Render:

```bash
corepack enable && corepack prepare pnpm@10.4.1 --activate
pnpm install --frozen-lockfile
pnpm build:frontend && pnpm build:server
node dist/index.js
```

Die Basis `node:22.13.0-bookworm-slim` ist ein Multi-Arch-Image (`linux/amd64`
und `linux/arm64`). Ein Build auf dem Raspberry Pi 400 mit **64-bit**-OS erzeugt
arm64 nativ. 32-bit-Raspberry-Pi-OS ist kein Ziel.

Ohne API-Keys startet die Seite. KI, semantische Suche und Live-Append in den
Korpus bleiben dann aus. `/api/health` antwortet trotzdem mit HTTP 200
(`status: "degraded"`, `server: "ok"`).

---

## Schnellstart

```bash
docker compose -f docker-compose.yml up --build -d
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

Der veröffentlichte Port hängt an `127.0.0.1`. Für einen Rechner im LAN:
`HOST_BIND=0.0.0.0 docker compose -f docker-compose.yml up --build -d`.

Secrets stehen in einer Datei `.env` neben `docker-compose.yml` (ist
gitignoriert) oder in der Coolify-Oberfläche. Die Compose-Datei lädt `.env`
in den Container, wenn die Datei existiert.

Nur das Image, ohne Compose:

```bash
docker build -t digitale-transformation-ebook:local .
docker run --rm -p 127.0.0.1:3000:3000 \
  -e SITE_URL=https://digitale-transformation-ebook.de \
  -e CANONICAL_REDIRECT=0 \
  digitale-transformation-ebook:local
```

`VITE_*` werden **beim Build** eingebrannt. Dafür `--build-arg` setzen
(siehe unten), nicht erst `-e` beim `docker run`.

---

## Coolify

1. Neues Projekt → **Resource** → **Private Repository (with GitHub App)** oder
   das öffentliche Repo. Branch `main`.
2. Build Pack **Dockerfile**. Dockerfile-Pfad: `/Dockerfile`. Port **3000**.
   Alternativ Build Pack **Docker Compose** und `docker-compose.yml`.
3. Domain setzen (eigene Domain oder die Coolify-Subdomain). TLS lässt Coolify
   über den Proxy ausstellen. Den Container nicht zusätzlich auf `0.0.0.0`
   veröffentlichen, wenn der Proxy ihn schon über das Docker-Netz erreicht.
4. Umgebungsvariablen in der Coolify-UI eintragen (Tabellen unten).
   Variablen, die mit `VITE_` beginnen, als **Build-Variable** markieren
   (Coolify übergibt sie als `--build-arg`, das Dockerfile deklariert sie als
   `ARG`). `SITE_URL` und die API-Keys sind Laufzeitvariablen; ein Neustart
   reicht, ein Rebuild nicht — außer du änderst `VITE_SITE_URL`.
5. Healthcheck: Pfad `/api/health`, Port `3000`. Das Image bringt denselben
   Check als `HEALTHCHECK` mit (Node-`fetch`, kein curl im Slim-Image).
   Der Endpunkt bleibt HTTP 200, auch wenn Gemini fehlt oder degradiert.
   Mit gesetztem Key dauert der Check einen Embedding-Probe; Timeout im Image
   ist 10 Sekunden, `start_period` 25 Sekunden.
6. Deploy. Der erste Build zieht das Node-Image und installiert das Lockfile.
   Danach reicht ein Redeploy bei Code-Änderungen. Korpus-JSONs, die die
   GitHub-Action nach `client/public/` schreibt, liest der laufende Server
   live von GitHub-Raw (wie auf Render) und fällt auf die ins Image kopierte
   Fassung zurück.

### Raspberry Pi 400

64-bit-OS (Raspberry Pi OS 64-bit oder ein arm64-Ubuntu). Docker installieren,
dieses Repo klonen, `docker compose -f docker-compose.yml up --build -d`.
Der Pi hat 4 GB RAM und keinen Swap ab Werk. Vor dem ersten Build eine
Swap-Datei anlegen (2 GB reichen als Puffer), sonst bricht `vite build` mit
einem Kill ab. Bauen auf einem stärkeren Rechner und das Image laden geht
auch: `docker buildx build --platform linux/arm64 -t <name> --load .`

---

## Parallel zu Render

Beide Instanzen können gleichzeitig laufen. Sie teilen sich den Korpus, sobald
sie denselben `GITHUB_TOKEN` und dasselbe Repo (`GITHUB_REPO_*`, Default
`marksen23/digitale-transformation-ebook`, Branch `main`) benutzen: Live-Append
schreibt Markdown und den Index über die GitHub-API nach `main`. Zwei Schreiber
können sich dabei in die Quere kommen; die Schreibpfade wiederholen bei HTTP 409.
Wer den selbst gehosteten Dienst nur lesen will, lässt `GITHUB_TOKEN` weg.

`CANONICAL_REDIRECT=1` leitet nur Hosts auf `*.onrender.com` und `*.netlify.app`
auf `SITE_URL` um. Auf einer eigenen Coolify-Domain ist der Schalter wirkungslos.
Auf dem Render-Dienst erst nach dem DNS-Flip auf `1` setzen (siehe `render.yaml`).

---

## Umgebungsvariablen

Pflicht zum **Starten** der Seite: keine. `NODE_ENV=production` und `PORT=3000`
setzt das Image. Ohne die Keys in „KI“ und „Korpus schreiben“ fehlt genau
dieser Teil, der Rest der Site bleibt bedienbar.

### Build-Zeit (Vite, `ARG` im Dockerfile)

| Variable | Pflicht | Bedeutung |
|----------|---------|-----------|
| `VITE_SITE_URL` | nein | Kanonische URL im Client (`client/src/lib/siteUrl.ts`). Default `https://digitale-transformation-ebook.de`. Eigene Domain: hier **und** als `SITE_URL` setzen, dann neu bauen. |
| `VITE_ANALYTICS_ENDPOINT` | nein | Umami-Origin ohne Slash am Ende. Nur zusammen mit der Website-ID entsteht ein Script-Tag. Dieselbe Variable zur **Laufzeit** setzen, sonst blockt die Content-Security-Policy das Script (`server/lib/securityHeaders.ts`). |
| `VITE_ANALYTICS_WEBSITE_ID` | nein | Umami-Website-ID. Nur Build. |
| `VITE_OAUTH_PORTAL_URL` | nein | Nur gelesen von `getLoginUrl` in `client/src/const.ts`. Die Funktion hängt an keiner Oberfläche. Leer lassen. |
| `VITE_APP_ID` | nein | Wie `VITE_OAUTH_PORTAL_URL`. |

### Laufzeit, Betrieb

| Variable | Pflicht | Default | Bedeutung |
|----------|---------|---------|-----------|
| `NODE_ENV` | ja, setzt das Image | `production` | Statische Dateien aus `dist/public`, HSTS an. |
| `PORT` | nein | `3000` | Lausch-Port. In Coolify denselben Port eintragen. |
| `SITE_URL` | nein | `https://digitale-transformation-ebook.de` | Canonical, Open Graph, Sitemap, JSON-LD (`server/lib/seo.ts`). Ohne abschließenden Slash. |
| `CANONICAL_REDIRECT` | nein | aus (`0`) | Nur `1` schaltet die 301 von `*.onrender.com` / `*.netlify.app` scharf. |
| `ADMIN_TOKEN` | für `/admin` | — | Fehlt er, ist der Admin-Zugang aus (HTTP 503 auf `/api/admin/check`). Beliebiges langes Geheimnis. |
| `GITHUB_TOKEN` | fürs Schreiben | — | PAT mit Scope `repo`. Ohne Token: kein Live-Append, keine persistierten Kanten, Knoten, Erkenntnisse, Admin-Config. |
| `GITHUB_REPO_OWNER` | nein | `marksen23` | Ziel-Repo für GitHub-API und Raw-URLs. |
| `GITHUB_REPO_NAME` | nein | `digitale-transformation-ebook` | |
| `GITHUB_REPO_BRANCH` | nein | `main` | |
| `CORPUS_REPO_OWNER` | nein | `marksen23` | Nur der RAG-Abruf (`server/lib/werkRetrieval.ts`). Unabhängig von `GITHUB_REPO_*`: wer das Repo umbiegt, setzt beide Gruppen. |
| `CORPUS_REPO_NAME` | nein | `digitale-transformation-ebook` | |
| `CORPUS_REPO_BRANCH` | nein | `main` | |

### Laufzeit, KI

| Variable | Pflicht | Default | Bedeutung |
|----------|---------|---------|-----------|
| `GEMINI_API_KEY` | für KI und semantische Suche | — | Google-AI-Studio-Key. Embeddings und die Leser-Endpunkte. |
| `GEMINI_API_KEY_FALLBACK` | nein | — | Zweiter Key, anderes GCP-Projekt, **selbes** Embedding-Modell. Greift bei Billing- oder Auth-Sperre des Primärkeys. |
| `GEMINI_API_KEYS` | nein | — | Komma-Liste weiterer Keys, wird vor den beiden einzelnen Keys versucht. |
| `GEMINI_EMBED_MODEL` | nein | `gemini-embedding-001` | Muss zum Korpus passen (3072 Dimensionen). Ein Wechsel braucht einen Neu-Embed des ganzen Korpus. |
| `GEMINI_TEXT_MODEL` | nein | `gemini-2.5-pro` | Default für `callGemini` (Richter: Pre-Score, Synthese). |
| `GEMINI_USER_MODEL` | nein | `gemini-2.5-flash` | Modell der leserseitigen Antworten. |
| `ANTHROPIC_API_KEY` | nur bei Claude | — | Pre-Score und Master-Synthese, wenn das Backend `claude` ist. Die Leser-KI läuft über Gemini. |
| `CLAUDE_MODEL` | nein | `claude-sonnet-4-6` | |
| `FLASH_THINKING_BUDGET` | nein | `0` | Thinking-Budget für `gemini-2.5-flash` auf den Prosa-Endpunkten. Leerer Wert = Modell-Default. |
| `PRESCORE_BACKEND` | nein | `gemini` | `gemini` oder `claude`. |
| `PRESCORE_MODEL` | nein | `gemini-2.5-pro` | Gemini-Modell des Pre-Scores. |
| `PRESCORE_THINKING_BUDGET` | nein | `512` | |
| `SYNTHESIS_BACKEND` | nein | `gemini` | `gemini` oder `claude`. |
| `SYNTHESIS_MODEL` | nein | `gemini-2.5-pro` | |
| `RAG_QUERY_ENRICHMENT` | nein | an | `0` schaltet die Begriffs-Anreicherung der RAG-Query aus. |
| `RAG_QUERY_EXPANSION` | nein | an, sobald ein Key da ist | `0` lässt die Query-Erweiterung weg. |
| `RAG_RERANK` | nein | aus | `1` schaltet das Reranking ein. |
| `CORPUS_EXCLUDED_ENDPOINTS` | nein | `translate` | Komma-Liste. Diese Endpunkte landen nicht im Index. Die Markdown-Dateien bleiben im Repo. |

Schwellen der Auto-Kuratierung und neuer Begriffe. Alle optional, der
Admin kann sie zusätzlich in `content/admin-config.json` überlagern
(dafür braucht es `GITHUB_TOKEN`).

| Variable | Default |
|----------|---------|
| `AUTO_CURATE_AI_MIN` | `4` |
| `AUTO_CURATE_CORPUS_MIN` | `0.55` |
| `AUTO_CURATE_AI_REJECT` | `2` |
| `AUTO_CURATE_CORPUS_REJECT` | `0.30` |
| `AUTO_CURATE_WERK_MIN` | `0.55` |
| `AUTO_CURATE_CONCEPT_MIN` | `0.65` |
| `AUTO_CURATE_CONCEPT_REJECT` | `0.62` |
| `CONCEPT_NEW_DISTINCT_MIN` | `0.10` |
| `CONCEPT_NEW_EVIDENCE_SIM` | `0.70` |
| `CONCEPT_NEW_EVIDENCE_MIN` | `1` |

### Laufzeit, nur die Admin-Diagnose alter Hoster

| Variable | Bedeutung |
|----------|-----------|
| `NETLIFY_TOKEN`, `NETLIFY_SITE_ID` | Deploy-Status von Netlify im Admin. Netlify ist abgelöst. |
| `RENDER_API_KEY`, `RENDER_SERVICE_ID` | Deploy-Status des Render-Dienstes im Admin. Für den Coolify-Betrieb unnötig. |

### Nur Skripte und CI, nicht der Container

Diese Variablen liest der Express-Server nicht. Sie wirken in
`scripts/build-resonanzen-index.ts` und den Helfer-Skripten, wenn jemand den
Korpus lokal oder in GitHub Actions neu baut.

| Variable | Default | Wo |
|----------|---------|----|
| `EMBEDDINGS_REQUIRED` | aus | CI: Workflow rot, wenn kein Embedding entstand. |
| `CONCEPT_CAND_DISTINCT_MIN` | `0.10` | Begriffs-Kandidaten. |
| `CONCEPT_CAND_EVIDENCE_MIN` | `3` | |
| `CONCEPT_CAND_CLUSTER_SIM` | `0.78` | |
| `CONCEPT_CAND_MAX_FRACTION` | `0.20` | |
| `QUESTIONS_ANSWER_SIM` | `0.72` | Fragenansicht. |
| `ERKENNTNIS_CAND_DISTINCT_MIN` | `0.20` | Erkenntnis-Kandidaten. |
| `NOVELTY_THRESHOLD` | `0.70` | Novelty-Flag im Index. |
| `LINK_PRED_MIN_COOC` | `2` | Kanten-Vorhersage. |
| `API_BASE` | Render-URL | `scripts/auto-curate.ts`, `scripts/dedup-corpus.ts`. |
| `OPENAI_API_KEY` | — | `scripts/generate-timestamps.mjs`. |

`NODE_VERSION` steht in `render.yaml` und steuert dort die Node-Version.
Das Image pinnt dieselbe Version im `FROM`. Die Variable selbst liest der
Server nicht.

---

## Was im Image liegt

- `dist/index.js` — Server-Bundle (esbuild, Packages extern).
- `dist/public/` — Vite-Build inklusive der committeten Korpus-JSONs und
  `ebook_content.md` als Fallback.
- `client/public` → Symlink auf `dist/public`, weil der RAG-Fallback den
  Pfad `client/public/…` relativ zum Working Directory erwartet.
- Produktions-`node_modules` aus dem Lockfile, reduziert auf die Pakete, die
  das Server-Bundle importiert (`express`, `pdf-lib`, `@anthropic-ai/sdk`)
  und deren Abhängigkeiten. Vite, esbuild, TypeScript, sharp und die
  React-Packages bleiben in der Build-Stage.

Der Prozess läuft als User `appuser` (UID 1001), nicht als root.
