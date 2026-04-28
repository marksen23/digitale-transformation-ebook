# Deployment auf Render

Anleitung zum Deployen des Ebook-Readers auf [render.com](https://render.com).

> **Wichtig:** Seitdem das Werk die Funktionen **„Frage an den Autor"** und **„Universelle Übersetzung"** enthält, ist ein **Web Service** (mit laufendem Express-Server) erforderlich — eine reine Static-Site reicht nicht mehr, weil die Endpoints `/api/ask` und `/api/translate` die Gemini-API serverseitig ansprechen.

---

## 1. Voraussetzungen

- GitHub-Konto mit gepushtem Branch (z. B. `main` oder `claude/competent-feynman`)
- Render-Konto (kostenloser Plan reicht)
- **Gemini API Key** von [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

---

## 2. Web Service auf Render anlegen

1. Einloggen auf [dashboard.render.com](https://dashboard.render.com)
2. Oben rechts **„New +"** → **„Web Service"**
3. GitHub verbinden und das Repository `digitale-transformation-ebook` auswählen
4. Konfiguration:

| Feld                 | Wert                                     |
|----------------------|------------------------------------------|
| **Name**             | `digitale-transformation-ebook`          |
| **Region**           | Frankfurt (oder gewünscht)               |
| **Branch**           | `main`                                   |
| **Runtime**          | `Node`                                   |
| **Build Command**    | `pnpm install && pnpm build`             |
| **Start Command**    | `node dist/index.js`                     |
| **Instance Type**    | `Free`                                   |

---

## 3. Environment Variables

Unter **Environment** → **Environment Variables** setzen:

| Key                  | Wert                                     |
|----------------------|------------------------------------------|
| `NODE_VERSION`       | `22.13.0`                                |
| `NODE_ENV`           | `production`                             |
| `GEMINI_API_KEY`     | *(dein Key aus Google AI Studio)*        |

> `PORT` **nicht** manuell setzen — Render injiziert diese Variable automatisch; der Server liest sie via `process.env.PORT`.

---

## 4. Deploy starten

1. **„Create Web Service"** klicken
2. Render führt nun aus:
   - `pnpm install` (Dependencies)
   - `pnpm build` → baut Vite-Frontend nach `dist/public/` **und** den Express-Server nach `dist/index.js`
   - `node dist/index.js` → startet den Server
3. Nach ~3–5 Minuten ist der Reader unter `https://<name>.onrender.com` erreichbar.

---

## 5. Verifikation nach Deploy

- Startseite öffnen → Cover wird angezeigt
- In ein Kapitel navigieren → Text rendert
- **T-Symbol** klicken → Schriftart wählen → Schrift wechselt
- **Languages-Symbol** klicken → „English" wählen → nach 2–5 Sekunden erscheint die Übersetzung mit „AI-übersetzt"-Badge
- **MessageCircle (Chat-Button)** klicken → Frage stellen → Gemini antwortet

Schlägt die Übersetzung oder Q&A fehl, in den Render-Logs nach `GEMINI_API_KEY ist nicht konfiguriert` oder `Gemini API error` suchen.

---

## 6. Automatische Deploys

Render deployt bei jedem Push auf den konfigurierten Branch automatisch neu.
Manuellen Deploy auslösen: Dashboard → Service → **„Manual Deploy"** → **„Deploy latest commit"**.

---

## 7. Troubleshooting

**pnpm nicht gefunden**
Render hat pnpm inzwischen vorinstalliert. Falls doch nicht:
- Build Command alternativ: `npm install -g pnpm@10.4.1 && pnpm install && pnpm build`

**Build fällt wegen TypeScript-Fehlern**
Lokal `pnpm check` laufen lassen und Fehler fixen, bevor erneut gepusht wird.

**Server bootet nicht / 502 Bad Gateway**
- Logs prüfen: `Server running on http://localhost:<port>/` muss erscheinen
- `PORT` **nicht** manuell überschreiben
- `NODE_ENV=production` muss gesetzt sein, damit der Server die statischen Files aus `dist/public/` ausliefert

**Gemini-API gibt 403 / 400**
- API-Key in Google AI Studio prüfen
- Quota checken — der Free-Tier von Gemini hat tägliche Limits

**Kaltstart dauert lang (Free-Plan)**
Auf dem kostenlosen Plan schläft der Service nach 15 Minuten Inaktivität und braucht beim ersten Request ~30 Sekunden zum Aufwachen. Upgrade auf `Starter` ($7/Monat) verhindert das.

---

## 8. Kurzfassung

```
Typ:         Web Service
Build:       pnpm install && pnpm build
Start:       node dist/index.js
ENV:         NODE_VERSION=22.13.0, NODE_ENV=production, GEMINI_API_KEY=<key>
```
