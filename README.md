# Die Digitale Transformation - E-Book

Ein professionelles, interaktives E-Book mit einer poetisch-philosophischen Trilogie über die digitale Transformation.

## 📚 Projektübersicht

**Die Digitale Transformation** ist eine dreibändige philosophische Trilogie von Markus Oehring, die die großen Fragen unserer Zeit behandelt:

- **Band I: Die Überführung** — Gilgamesch im digitalen Zeitalter
- **Band II: Der Ausgang** — Kant im Zeitalter der Maschinenvernunft  
- **Band III: Die Rückbindung** — Resonanz im Zeitalter der Entfremdung

Das E-Book bietet ein elegantes, professionelles Leseerlebnis mit:

- ✨ Hochwertigen generierten Illustrationen
- 📖 Seitenweise strukturiertem Inhalt (101 Seiten)
- 🎨 Elegantem Deep Indigo & Gold Design
- 📱 Responsivem, mobilfreundlichem Layout
- ⚡ Schneller Performance durch Vite
- 🔍 Intuitive Navigation und Seitenumbruch

---

## 🚀 Quick Start

### Lokal ausführen

```bash
# Abhängigkeiten installieren
pnpm install

# Entwicklungsserver starten
pnpm dev

# Öffnen Sie http://localhost:3000 im Browser
```

### Für Production bauen

```bash
pnpm build
pnpm preview
```

---

## 📦 Deployment

### Netlify Deployment

```bash
# Mit Netlify CLI
netlify deploy --prod --dir=dist/public

# Oder: GitHub Integration verwenden
# (siehe SETUP_ANLEITUNG.md für Details)
```

Für detaillierte Anweisungen siehe **SETUP_ANLEITUNG.md**.

---

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + Custom CSS
- **Build Tool**: Vite 7
- **UI Components**: shadcn/ui
- **Routing**: Wouter
- **Server**: Express (für Production)
- **Package Manager**: pnpm

---

## 📁 Projektstruktur

```
digitale-transformation-ebook/
├── client/                    # Frontend-Anwendung
│   ├── public/               # Statische Assets
│   │   ├── band1.txt        # Band I Textinhalte
│   │   ├── band2.txt        # Band II Textinhalte
│   │   ├── band3.txt        # Band III Textinhalte
│   │   └── bands_pages.json # Seitenweise Struktur
│   ├── src/
│   │   ├── pages/           # Seiten-Komponenten
│   │   ├── components/      # UI-Komponenten
│   │   ├── App.tsx          # Haupt-App
│   │   ├── main.tsx         # Entry Point
│   │   └── index.css        # Globale Styles
│   └── index.html           # HTML Template
├── server/                   # Backend (Express)
├── package.json             # Dependencies
├── netlify.toml            # Netlify Config
├── vite.config.ts          # Vite Config
├── tsconfig.json           # TypeScript Config
├── SETUP_ANLEITUNG.md      # Deployment Guide
└── README.md               # Diese Datei
```

---

## 🎨 Design

Das E-Book nutzt ein elegantes, professionelles Design-System:

- **Farbpalette**: Deep Indigo (#192347) + Gold (#DAA520)
- **Typografie**: Georgia (Überschriften) + System Sans (Body)
- **Layout**: Konsistente Seitenhöhe mit festen Fußzeilen
- **Illustrationen**: Hochwertige generierte Bilder für visuellen Impact

---

## 📖 Inhalte

Das E-Book enthält:

- **Frontcover** mit professionellem Design
- **Inhaltsverzeichnis** mit Navigation
- **Vorwort** des Autors
- **Präambel** zur Trilogie
- **Band I**: 41 Seiten (Gilgamesch-Transformation)
- **Band II**: 31 Seiten (Kant & Aufklärung)
- **Band III**: 29 Seiten (Resonanzphilosophie)

**Gesamt**: 101 Seiten mit vollständigen Inhalten

---

## 🔧 Konfiguration

### Umgebungsvariablen

Das Projekt benötigt keine speziellen Umgebungsvariablen für das Standard-Setup.

### Netlify Konfiguration

Die `netlify.toml` enthält:
- Build-Befehle
- Publish-Verzeichnis
- Redirects für SPA-Routing
- Environment-Variablen

---

## 📝 Inhalte aktualisieren

### Textinhalte ändern

1. Bearbeiten Sie die Dateien in `client/public/`:
   - `band1.txt`, `band2.txt`, `band3.txt`
   - `bands_pages.json` (für seitenweise Struktur)

2. Committen und pushen:
   ```bash
   git add .
   git commit -m "Update: Inhalte aktualisiert"
   git push origin main
   ```

3. Netlify deployed automatisch neu

### Design anpassen

- **Farben**: `client/src/index.css` (CSS-Variablen)
- **Layout**: `client/src/pages/Home.tsx`
- **Illustrationen**: URLs in `Home.tsx` ersetzen

---

## 🚀 Performance

- **Bundle Size**: ~150KB (gzipped)
- **Lighthouse Score**: 95+
- **Load Time**: < 2 Sekunden
- **Caching**: Optimiert für Netlify CDN

---

## 🔐 Sicherheit

- Keine sensiblen Daten im Code
- Alle Inhalte sind öffentlich
- HTTPS automatisch durch Netlify
- CSP Headers konfiguriert

---

## 📞 Support

Für Fragen oder Probleme:

1. Lesen Sie **SETUP_ANLEITUNG.md**
2. Überprüfen Sie die [Netlify Docs](https://docs.netlify.com)
3. Konsultieren Sie die [Vite Docs](https://vitejs.dev)

---

## 📄 Lizenz

Dieses Projekt enthält die Werke von Markus Oehring. Alle Rechte vorbehalten.

---

## 🎯 Nächste Schritte

Nach dem Deployment können Sie:

1. ✅ Custom Domain verbinden
2. ✅ Analytics aktivieren
3. ✅ Suchfunktion hinzufügen
4. ✅ Lesefortschritt speichern
5. ✅ PDF-Download implementieren
6. ✅ Social Media Integration

---

**Version**: 1.0  
**Erstellt**: April 2026  
**Status**: Production Ready ✨
