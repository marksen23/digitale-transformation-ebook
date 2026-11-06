# Deployment auf Render

Der Ebook-Reader läuft als **Web Service** auf [render.com](https://render.com).
Express liefert das Frontend (`dist/public`) und die API (`/api/*`).

**`render.yaml` ist die einzige Quelle** für Build-Befehl, Start-Befehl,
Node-Version und Env. Diese Anleitung beschreibt dieselbe Datei — wenn sie
abweicht, gilt die Blueprint.

---

## 1. Voraussetzungen

- GitHub-Konto, Branch `main`
- Render-Konto
- **Gemini API Key** von [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Für Live-Append in den Korpus zusätzlich ein GitHub-PAT (`repo`-Scope)

---

## 2. Web Service anlegen

Am einfachsten über die Blueprint: Render-Dashboard → **New +** → **Blueprint**
und dieses Repository wählen. Render liest `render.yaml`.

Manuell (dieselben Werte):

| Feld | Wert |
|------|------|
| **Name** | `digitale-transformation-ebook` |
| **Runtime** | `Node` |
| **Branch** | `main` |
| **Build Command** | `corepack enable && corepack prepare pnpm@10.4.1 --activate && pnpm install --frozen-lockfile && pnpm build:frontend && pnpm build:server` |
| **Start Command** | `node dist/index.js` |
| **Node** | `22.13.0` (`NODE_VERSION` in `render.yaml`) |

`pnpm@10.4.1` ist das `packageManager`-Feld in `package.json`. Corepack
aktiviert genau diese Version; `--frozen-lockfile` installiert
`pnpm-lock.yaml` und scheitert, wenn die Lockfile nicht zum Manifest passt.

**Nicht** `pnpm build` und **nicht** `npm install --legacy-peer-deps`.
`pnpm build` rechnet Korpus-Index, Embeddings und PDF neu (Gemini-Calls) —
das macht die GitHub-Action. Der `--legacy-peer-deps`-Flag war nur nötig,
weil `@builder.io/vite-plugin-jsx-loc` Vite 4/5 erwartet hat. Das Plugin
ist entfernt; der Build nutzt den Lockfile.

**Instanz-Typ:** `render.yaml` setzt kein `plan`. Den bestehenden Tarif im
Dashboard nicht über die Blueprint überschreiben. Der Dienst ist als
Always-On-Web-Service gedacht (kein Free-Tier-Sleep); ein Free-Plan würde
nach Inaktivität einschlafen und steht nicht in der Blueprint.

---

## 3. Environment Variables

Stehen in `render.yaml`. `PORT` nicht setzen — Render injiziert sie, der
Server liest `process.env.PORT`.

| Key | Wert | Herkunft |
|-----|------|----------|
| `NODE_ENV` | `production` | Blueprint |
| `NODE_VERSION` | `22.13.0` | Blueprint |
| `SITE_URL` | `https://digitale-transformation-ebook.de` | Blueprint |
| `VITE_SITE_URL` | `https://digitale-transformation-ebook.de` | Blueprint (Vite-Build) |
| `CANONICAL_REDIRECT` | `"0"` | Blueprint. Erst **nach** dem DNS-Flip auf `1` setzen, sonst leitet onrender auf eine noch nicht live Domain um. |
| `ANTHROPIC_API_KEY` | Dashboard | `sync: false` |
| `GEMINI_API_KEY` | Dashboard | `sync: false` |
| `GEMINI_API_KEY_FALLBACK` | Dashboard, optional | `sync: false` |
| `GITHUB_TOKEN` | Dashboard, PAT mit `repo` | `sync: false`, Pflicht für Live-Append |

Optional, beide zusammen, sonst wird kein Analytics-Script ausgeliefert:

| Key | Wert |
|-----|------|
| `VITE_ANALYTICS_ENDPOINT` | Umami-Origin, ohne abschließenden Slash (z. B. `https://analytics.example`) |
| `VITE_ANALYTICS_WEBSITE_ID` | Website-ID |

Das sind Vite-Variablen: sie müssen **beim Build** gesetzt sein. Fehlt eine
von beiden, enthält `index.html` kein Umami-Tag (kein Request auf
`%VITE_ANALYTICS_…%`).

---

## 4. Was der Build tut

1. `corepack prepare pnpm@10.4.1 --activate`
2. `pnpm install --frozen-lockfile`
3. `pnpm build:frontend` — `vite build` nach `dist/public/` (kopiert die
   committeten Korpus-JSONs als Fallback, rechnet sie nicht neu)
4. `pnpm build:server` — esbuild nach `dist/index.js`
5. `node dist/index.js`

Build-Filter in `render.yaml`: neu gebaut wird bei Änderungen unter
`server/**`, `client/src/**`, `client/index.html`, `package.json`,
`pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `render.yaml`.
**Kein** Redeploy bei `client/public/**`, `content/**`, `scripts/**`, `*.md`
— wachsende Korpus-JSONs liest der Server live von GitHub-Raw.

---

## 5. Verifikation nach Deploy

- Startseite öffnen → Cover wird angezeigt
- In ein Kapitel navigieren → Text rendert
- **T-Symbol** klicken → Schriftart wählen → Schrift wechselt
  (OpenDyslexic lädt erst in diesem Menü)
- **Languages-Symbol** klicken → „English" wählen → nach einigen Sekunden
  erscheint die Übersetzung
- Frage an den Text stellen → Gemini antwortet

Schlägt Übersetzung oder Q&A fehl, in den Render-Logs nach
`GEMINI_API_KEY ist nicht konfiguriert` oder `Gemini API error` suchen.

Antwort-Header (Produktion): kein `X-Powered-By`; dafür
`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` und eine
`Content-Security-Policy` (`frame-ancestors 'self'`, Google Fonts und
cdnfonts erlaubt, Inline-Styles wegen der SPA). Dateien unter `/assets/`
kommen mit `Cache-Control: public, max-age=31536000, immutable`, das HTML
mit `no-cache`.

---

## 6. Automatische Deploys

Render deployt bei jedem Push auf `main`, der die Build-Filter trifft.
Manuell: Dashboard → Service → **Manual Deploy** → **Deploy latest commit**.

---

## 7. Troubleshooting

**`pnpm` nicht gefunden / Corepack lädt nicht**

Der Build-Befehl aktiviert Corepack und pinnt `pnpm@10.4.1`. Node `22.13.0`
bringt Corepack mit. Falls die Signaturprüfung von Corepack scheitert, im
Dashboard vor dem Befehl `COREPACK_INTEGRITY_KEYS=0` setzen (nur dieser
Dienst, nicht ins Repo) und neu deployen.

**Build fällt wegen Lockfile**

`pnpm install --frozen-lockfile` bricht ab, wenn `pnpm-lock.yaml` nicht zu
`package.json` passt. Lokal `pnpm install` laufen lassen und die Lockfile
committen. Nicht auf `npm install` ausweichen — es gibt keine
`package-lock.json`.

**Build fällt wegen TypeScript**

Lokal `pnpm check` laufen lassen.

**Server bootet nicht / 502**

- Logs: `Server running on http://localhost:<port>/` muss erscheinen
- `PORT` nicht manuell überschreiben
- `NODE_ENV=production`, damit statische Dateien aus `dist/public/` kommen

**Gemini-API gibt 403 / 400**

- API-Key in Google AI Studio prüfen
- Quota prüfen. Optional `GEMINI_API_KEY_FALLBACK` (anderes GCP-Projekt,
  selbes Embedding-Modell)

---

## 8. Kurzfassung

```
Blueprint:   render.yaml
Build:       corepack enable && corepack prepare pnpm@10.4.1 --activate && pnpm install --frozen-lockfile && pnpm build:frontend && pnpm build:server
Start:       node dist/index.js
Node:        22.13.0
ENV:         NODE_ENV=production, SITE_URL + VITE_SITE_URL = https://digitale-transformation-ebook.de, CANONICAL_REDIRECT=0
Secrets:     ANTHROPIC_API_KEY, GEMINI_API_KEY, GEMINI_API_KEY_FALLBACK, GITHUB_TOKEN (Dashboard)
```
