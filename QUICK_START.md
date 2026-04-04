# Quick Start - Die Digitale Transformation E-Book

## ⚡ 5 Minuten bis zum Live-E-Book

### 1️⃣ Projekt entpacken
```bash
unzip digitale-transformation-ebook.zip
cd digitale-transformation-ebook
```

### 2️⃣ Abhängigkeiten installieren
```bash
pnpm install
```

### 3️⃣ Lokal testen
```bash
pnpm dev
# Öffnen Sie http://localhost:3000
```

### 4️⃣ Für Production bauen
```bash
pnpm build
```

---

## 🚀 Auf Netlify deployen

### Option A: Mit GitHub (Empfohlen)

1. **GitHub Repository erstellen**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/IHRE_USERNAME/digitale-transformation-ebook.git
   git push -u origin main
   ```

2. **Mit Netlify verbinden**
   - Gehen Sie zu [netlify.com](https://netlify.com)
   - Klicken Sie "Add new site" → "Import an existing project"
   - Wählen Sie GitHub
   - Wählen Sie Ihr Repository
   - Klicken Sie "Deploy site"

✅ **Fertig!** Netlify deployed automatisch bei jedem Push.

### Option B: Mit Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=dist/public
```

### Option C: Drag & Drop

```bash
pnpm build
# Ziehen Sie den dist/public Ordner auf https://netlify.com/drop
```

---

## 📚 Inhalte anpassen

### Texte ändern
- `client/public/band1.txt` - Band I
- `client/public/band2.txt` - Band II
- `client/public/band3.txt` - Band III

### Design ändern
- `client/src/index.css` - Farben & Fonts
- `client/src/pages/Home.tsx` - Layout

### Bilder ersetzen
- Ersetzen Sie die URLs in `Home.tsx`:
  ```javascript
  const coverImageUrl = 'NEUE_URL_HIER';
  ```

---

## 🔗 Wichtige Links

- **Vollständige Anleitung**: Lesen Sie `SETUP_ANLEITUNG.md`
- **Projektinfo**: Lesen Sie `README.md`
- **Netlify Docs**: [docs.netlify.com](https://docs.netlify.com)
- **Vite Docs**: [vitejs.dev](https://vitejs.dev)

---

## ❓ Häufige Probleme

| Problem | Lösung |
|---------|--------|
| `pnpm: command not found` | `npm install -g pnpm` |
| Port 3000 belegt | `pnpm dev -- --port 3001` |
| Build schlägt fehl | `rm -rf node_modules && pnpm install` |
| Seiten nicht sichtbar | Überprüfen Sie `netlify.toml` |

---

## 📞 Benötigen Sie Hilfe?

1. Lesen Sie `SETUP_ANLEITUNG.md` für detaillierte Anweisungen
2. Überprüfen Sie die [Netlify Docs](https://docs.netlify.com)
3. Konsultieren Sie die [Vite Docs](https://vitejs.dev)

---

**Viel Erfolg beim Deployment! 🚀**
