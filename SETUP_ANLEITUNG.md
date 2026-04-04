# Die Digitale Transformation - E-Book
## Netlify Deployment Setup-Anleitung

Dieses Projekt ist ein professionelles, interaktives E-Book mit drei philosophischen Bänden. Diese Anleitung führt Sie durch die Installation und das Deployment auf Netlify.

---

## 📋 Voraussetzungen

Bevor Sie beginnen, stellen Sie sicher, dass Sie folgende Tools installiert haben:

- **Node.js** (Version 22.13.0 oder höher): [nodejs.org](https://nodejs.org)
- **pnpm** (Version 10.4.1 oder höher): `npm install -g pnpm`
- **Git**: [git-scm.com](https://git-scm.com)
- **Netlify CLI** (optional, aber empfohlen): `npm install -g netlify-cli`

---

## 🚀 Lokale Installation

### Schritt 1: Projekt entpacken
```bash
unzip digitale-transformation-ebook.zip
cd digitale-transformation-ebook
```

### Schritt 2: Abhängigkeiten installieren
```bash
pnpm install
```

### Schritt 3: Lokale Entwicklung starten
```bash
pnpm dev
```

Die Anwendung wird unter `http://localhost:3000` verfügbar sein.

### Schritt 4: Für Production bauen
```bash
pnpm build
```

Dies erstellt eine optimierte Production-Version im `dist/` Verzeichnis.

---

## 🌐 Netlify Deployment

### Option A: Automatisches Deployment mit GitHub

**Empfohlen für kontinuierliche Updates**

1. **GitHub Repository erstellen**
   - Gehen Sie zu [github.com/new](https://github.com/new)
   - Erstellen Sie ein neues Repository (z.B. `digitale-transformation-ebook`)
   - Klonen Sie das Repository auf Ihren Computer

2. **Projekt in GitHub hochladen**
   ```bash
   cd digitale-transformation-ebook
   git init
   git add .
   git commit -m "Initial commit: E-Book Projekt"
   git branch -M main
   git remote add origin https://github.com/IHRE_USERNAME/digitale-transformation-ebook.git
   git push -u origin main
   ```

3. **Mit Netlify verbinden**
   - Gehen Sie zu [netlify.com](https://netlify.com)
   - Melden Sie sich an (oder erstellen Sie ein kostenloses Konto)
   - Klicken Sie auf "Add new site" → "Import an existing project"
   - Wählen Sie GitHub als Provider
   - Autorisieren Sie Netlify, auf Ihre GitHub-Repositories zuzugreifen
   - Wählen Sie das `digitale-transformation-ebook` Repository
   - Klicken Sie auf "Deploy site"

Netlify wird automatisch:
- Die Abhängigkeiten installieren
- Das Projekt bauen
- Es deployen und eine URL bereitstellen

### Option B: Manuelles Deployment mit Netlify CLI

**Für schnelle Tests oder einmalige Deployments**

1. **Netlify CLI installieren**
   ```bash
   npm install -g netlify-cli
   ```

2. **Mit Netlify anmelden**
   ```bash
   netlify login
   ```

3. **Projekt bauen**
   ```bash
   pnpm build
   ```

4. **Deployen**
   ```bash
   netlify deploy --prod --dir=dist/public
   ```

Netlify wird eine URL generieren, unter der Ihr E-Book verfügbar ist.

### Option C: Drag & Drop Deployment

**Für schnelle Tests ohne Git**

1. **Projekt bauen**
   ```bash
   pnpm build
   ```

2. **Auf Netlify deployen**
   - Gehen Sie zu [netlify.com/drop](https://netlify.com/drop)
   - Ziehen Sie den `dist/public` Ordner in die Drop-Zone
   - Netlify erstellt automatisch eine temporäre URL

---

## 📁 Projektstruktur

```
digitale-transformation-ebook/
├── client/                          # Frontend-Code
│   ├── public/                      # Statische Dateien
│   │   ├── band1.txt               # Band I Textinhalte
│   │   ├── band2.txt               # Band II Textinhalte
│   │   ├── band3.txt               # Band III Textinhalte
│   │   ├── bands_pages.json        # Seitenweise strukturierte Inhalte
│   │   └── __manus__/              # Manus-spezifische Dateien
│   ├── src/
│   │   ├── pages/
│   │   │   └── Home.tsx            # Hauptseite des E-Books
│   │   ├── components/             # Wiederverwendbare UI-Komponenten
│   │   ├── App.tsx                 # Haupt-App-Komponente
│   │   ├── main.tsx                # React Entry Point
│   │   └── index.css               # Globale Styles
│   └── index.html                  # HTML-Template
├── server/
│   └── index.ts                    # Express Server (für Production)
├── shared/                         # Gemeinsame Types/Utilities
├── package.json                    # Abhängigkeiten und Scripts
├── netlify.toml                    # Netlify Konfiguration
├── tsconfig.json                   # TypeScript Konfiguration
├── vite.config.ts                  # Vite Build-Konfiguration
└── SETUP_ANLEITUNG.md             # Diese Datei
```

---

## ⚙️ Konfiguration

### Umgebungsvariablen

Das Projekt benötigt keine speziellen Umgebungsvariablen für das Standard-Deployment. Falls Sie später Backend-Funktionen hinzufügen möchten, können Sie diese in Netlify hinzufügen:

1. Gehen Sie zu Ihrem Netlify Dashboard
2. Wählen Sie Ihr Projekt
3. Gehen Sie zu "Site settings" → "Build & deploy" → "Environment"
4. Klicken Sie auf "Edit variables"
5. Fügen Sie Ihre Variablen hinzu

### Netlify Funktionen (Optional)

Das Projekt ist vorkonfiguriert für Netlify Functions. Falls Sie später Server-Funktionen hinzufügen möchten:

1. Erstellen Sie eine Datei in `netlify/functions/` (z.B. `hello.ts`)
2. Netlify wird diese automatisch deployen
3. Sie sind dann unter `/.netlify/functions/hello` verfügbar

---

## 🔧 Troubleshooting

### Problem: "pnpm: command not found"
**Lösung:**
```bash
npm install -g pnpm
```

### Problem: "Port 3000 is already in use"
**Lösung:**
```bash
pnpm dev -- --port 3001
```

### Problem: Build schlägt fehl
**Lösung:**
1. Löschen Sie `node_modules` und `.pnpm-store`:
   ```bash
   rm -rf node_modules .pnpm-store
   ```
2. Installieren Sie neu:
   ```bash
   pnpm install
   ```
3. Versuchen Sie erneut zu bauen:
   ```bash
   pnpm build
   ```

### Problem: Seiten werden nicht korrekt angezeigt
**Lösung:**
- Stellen Sie sicher, dass die `netlify.toml` Datei im Root-Verzeichnis vorhanden ist
- Überprüfen Sie, dass die `dist/public` Datei nach dem Build vorhanden ist
- Löschen Sie den Browser-Cache und laden Sie neu

---

## 📊 Performance-Tipps

1. **Caching optimieren**
   - Netlify cached automatisch statische Assets
   - Für häufig aktualisierte Inhalte: Cache-Header in `netlify.toml` anpassen

2. **Bilder optimieren**
   - Die generierten Illustrationen sind bereits optimiert
   - Für weitere Bilder: WebP-Format verwenden

3. **Bundle-Größe reduzieren**
   - Das Projekt nutzt Tree-shaking durch Vite
   - Vermeiden Sie große externe Abhängigkeiten

---

## 🔐 Sicherheit

- Das Projekt enthält keine sensiblen Daten
- Alle Inhalte sind öffentlich
- Falls Sie später Authentifizierung hinzufügen: Netlify Identity verwenden

---

## 📝 Inhalte aktualisieren

### Textinhalte ändern

1. **Band-Texte aktualisieren**
   - Bearbeiten Sie `client/public/band1.txt`, `band2.txt`, `band3.txt`
   - Oder aktualisieren Sie `client/public/bands_pages.json` für seitenweise Änderungen

2. **Änderungen deployen**
   ```bash
   git add .
   git commit -m "Update: Band-Inhalte aktualisiert"
   git push origin main
   ```
   - Netlify wird automatisch neu bauen und deployen

### Design ändern

1. **Farben/Fonts anpassen**
   - Bearbeiten Sie `client/src/index.css`

2. **Illustrationen ersetzen**
   - Ersetzen Sie die Image-URLs in `client/src/pages/Home.tsx`
   - Oder laden Sie neue Bilder in `client/public/` hoch

3. **Layout modifizieren**
   - Bearbeiten Sie `client/src/pages/Home.tsx`

---

## 🚀 Nächste Schritte

Nach dem erfolgreichen Deployment können Sie:

1. **Custom Domain verbinden**
   - In Netlify: "Site settings" → "Domain management"
   - Ihre eigene Domain konfigurieren

2. **SSL/HTTPS aktivieren**
   - Netlify aktiviert automatisch kostenloses SSL

3. **Analytics aktivieren**
   - In Netlify: "Analytics" → "Enable analytics"
   - Besucher-Statistiken einsehen

4. **Weitere Features hinzufügen**
   - Suchfunktion
   - Lesefortschritt speichern
   - PDF-Download
   - Social Media Integration

---

## 📞 Support & Ressourcen

- **Netlify Docs**: [docs.netlify.com](https://docs.netlify.com)
- **Vite Docs**: [vitejs.dev](https://vitejs.dev)
- **React Docs**: [react.dev](https://react.dev)
- **Tailwind CSS**: [tailwindcss.com](https://tailwindcss.com)

---

## 📄 Lizenz

Dieses Projekt enthält die Werke von Markus Oehring. Alle Rechte vorbehalten.

---

**Version**: 1.0  
**Datum**: April 2026  
**Letztes Update**: 2026-04-02
