# Setup & Deployment Guide

## Inhalt
1. [GitHub: Branch einrichten & lokal verbinden](#1-github-branch-einrichten--lokal-verbinden)
2. [Deployment auf Netlify](#2-deployment-auf-netlify)
3. [Deployment auf Render](#3-deployment-auf-render)
4. [Zusammenfassung](#4-zusammenfassung)

---

## 1. GitHub: Branch einrichten & lokal verbinden

### Aktueller Stand
Das Repo hat zwei Branches:
- **`main`** — der ursprüngliche Code
- **`claude/competent-feynman`** — der neue Ebook-Reader (deine aktuellen Änderungen)

### Option A: Branch in `main` mergen (empfohlen)

Wenn du zufrieden mit den Änderungen bist, merge den Branch in `main`:

```bash
# In deinen lokalen Repo-Ordner wechseln
cd C:\Users\marks\OneDrive\Dokumente\GitHub\digitale-transformation-ebook

# Aktuellen Stand holen
git fetch origin

# Auf main wechseln
git checkout main

# Branch mergen
git merge origin/claude/competent-feynman

# Pushen
git push origin main
```

Danach kannst du **Netlify/Render direkt auf `main`** zeigen lassen.

### Option B: Direkt den Feature-Branch deployen

Du kannst bei Netlify/Render auch `claude/competent-feynman` als Deploy-Branch angeben. Das ist nützlich zum Testen, bevor du in `main` mergst.

### Lokalen Ordner mit dem Repo verbinden

Falls du einen frischen lokalen Ordner nutzen willst:

```bash
# Repo klonen
git clone https://github.com/marksen23/digitale-transformation-ebook.git
cd digitale-transformation-ebook

# Dependencies installieren
npm install
# oder, falls pnpm verfügbar:
pnpm install

# Dev-Server starten
npm run dev
```

Falls du bereits einen Ordner hast, der nicht mit Git verbunden ist:

```bash
cd /pfad/zu/deinem/ordner

# Git initialisieren und Remote hinzufügen
git init
git remote add origin https://github.com/marksen23/digitale-transformation-ebook.git
git fetch origin
git checkout main
```

### Worktree vs. normaler Checkout

Du arbeitest aktuell in einem **Git Worktree** (`.claude/worktrees/competent-feynman`). Das ist ein temporärer Arbeitsbereich. Dein Hauptrepo liegt unter:
```
C:\Users\marks\OneDrive\Dokumente\GitHub\digitale-transformation-ebook
```

Um dort die neuesten Änderungen zu sehen:
```bash
cd C:\Users\marks\OneDrive\Dokumente\GitHub\digitale-transformation-ebook
git fetch origin
git checkout main
git merge origin/claude/competent-feynman
```

---

## 2. Deployment auf Netlify

### Schritt 1: Netlify-Konto erstellen
1. Gehe zu [netlify.com](https://www.netlify.com/) und erstelle ein Konto (kostenlos)
2. Klicke auf **"Add new site"** > **"Import an existing project"**

### Schritt 2: GitHub verbinden
1. Wähle **GitHub** als Provider
2. Autorisiere Netlify für dein GitHub-Konto
3. Wähle das Repository **`marksen23/digitale-transformation-ebook`**

### Schritt 3: Build-Einstellungen konfigurieren

Die `netlify.toml` im Repo konfiguriert alles automatisch. Falls du es manuell eingeben musst:

| Einstellung         | Wert                                    |
|---------------------|-----------------------------------------|
| **Branch to deploy**| `main` (oder `claude/competent-feynman`)|
| **Build command**   | `pnpm install && pnpm build`            |
| **Publish directory**| `dist/public`                          |
| **Node version**    | `22` (unter Environment Variables)      |

### Schritt 4: Environment Variables (optional)

Falls pnpm nicht erkannt wird, setze unter **Site settings > Environment variables**:
```
NODE_VERSION = 22.13.0
PNPM_VERSION = 10.4.1
```

### Schritt 5: Deployen
1. Klicke **"Deploy site"**
2. Netlify baut automatisch und gibt dir eine URL wie `https://dein-site-name.netlify.app`
3. Unter **Site settings > Domain management** kannst du eine eigene Domain verbinden

### Automatische Deploys
Nach dem Setup deployt Netlify **automatisch bei jedem Push** auf den konfigurierten Branch.

### Troubleshooting Netlify

**Problem: pnpm nicht gefunden**
```
# Alternative: Build Command ändern zu:
npm install && npm run build
```

**Problem: Build schlägt fehl wegen esbuild/server**
Der Build-Befehl baut auch den Express-Server. Für ein reines Static-Site-Deployment auf Netlify reicht:
```
# Nur den Vite-Build ausführen (als Custom Build Command):
pnpm install && pnpm vite build
```

---

## 3. Deployment auf Render

### Schritt 1: Render-Konto erstellen
1. Gehe zu [render.com](https://render.com/) und erstelle ein Konto (kostenlos)

### Option A: Als Static Site (einfacher, kostenlos)

1. Klicke **"New"** > **"Static Site"**
2. Verbinde dein GitHub-Konto und wähle das Repository
3. Konfiguriere:

| Einstellung         | Wert                           |
|---------------------|--------------------------------|
| **Name**            | `digitale-transformation-ebook`|
| **Branch**          | `main`                         |
| **Build Command**   | `pnpm install && pnpm vite build` |
| **Publish Directory**| `dist/public`                 |

4. Unter **Environment** > **Environment Variables**:
```
NODE_VERSION = 22.13.0
```

5. Klicke **"Create Static Site"**

### Option B: Als Web Service (mit Express-Server)

Falls du den Express-Server brauchst (z.B. für API-Endpunkte):

1. Klicke **"New"** > **"Web Service"**
2. Verbinde dein GitHub-Repository
3. Konfiguriere:

| Einstellung         | Wert                           |
|---------------------|--------------------------------|
| **Name**            | `digitale-transformation-ebook`|
| **Branch**          | `main`                         |
| **Runtime**         | `Node`                         |
| **Build Command**   | `pnpm install && pnpm build`   |
| **Start Command**   | `node dist/index.js`           |

4. Unter **Environment** > **Environment Variables**:
```
NODE_VERSION = 22.13.0
NODE_ENV = production
PORT = 10000
```

5. Wähle **"Free"** als Plan
6. Klicke **"Create Web Service"**

### Automatische Deploys
Render deployt ebenfalls **automatisch bei jedem Push**.

### Troubleshooting Render

**Problem: pnpm nicht verfügbar**
```
# Build Command ändern zu:
npm install && npm run build
```

**Problem: Port-Binding**
Render erwartet, dass der Server auf `PORT` aus der Umgebung hört. Der Express-Server tut das bereits:
```js
const port = process.env.PORT || 3000;
```

---

## 4. Zusammenfassung

### Schnellster Weg zum Live-Deployment

```bash
# 1. Branch in main mergen (lokal)
cd C:\Users\marks\OneDrive\Dokumente\GitHub\digitale-transformation-ebook
git fetch origin
git checkout main
git merge origin/claude/competent-feynman
git push origin main

# 2. Netlify: Repo verbinden, fertig (netlify.toml wird automatisch erkannt)
# 3. Oder Render: Static Site, Build Command = "pnpm install && pnpm vite build"
```

### Vergleich Netlify vs. Render

| Feature              | Netlify (Static)  | Render (Static)  | Render (Web Service) |
|----------------------|-------------------|-------------------|----------------------|
| **Kosten**           | Kostenlos          | Kostenlos         | Kostenlos (mit Limits)|
| **Auto-Deploy**      | Ja                 | Ja                | Ja                   |
| **Custom Domain**    | Ja                 | Ja                | Ja                   |
| **SSL**              | Automatisch        | Automatisch       | Automatisch          |
| **Server-Side Code** | Nein (nur Functions)| Nein             | Ja                   |
| **Build-Speed**      | Schnell            | Mittel            | Mittel               |
| **Empfehlung**       | Beste Wahl         | Gut               | Wenn Server nötig    |

**Empfehlung:** Für dieses Projekt reicht **Netlify als Static Site** vollkommen aus, da der Ebook-Reader ein reines Frontend ist.
