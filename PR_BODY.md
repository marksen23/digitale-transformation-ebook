# Phase 1+2: Resonanz-Logging, Lizenz, History-Log + frühere Features

## Was dieser PR bringt

Bündelt mehrere Arbeitslinien des Feature-Branches `claude/competent-feynman`. Der **unmittelbare Anlass** sind Phase 1 + Phase 2 des Resonanz-Architektur-Plans (Commits `7a3d44b`, `1cc3edd`, `8d0eadb`). Damit diese Änderungen auf Render deployen, müssen die früheren Commits dieses Branches mit auf `main` — sie sind aber separat reviewt und seit Wochen auf dem Feature-Branch stabil.

## Phase 1+2 Resonanz-Architektur (jüngste 3 Commits)

- **LICENSE** im Repo-Root: proprietäre Source-Available-Lizenz, Personal-Use-only, akademisches Zitieren bis 100 Wörter mit Attribution erlaubt, Redistribution + Derivate + ML-Training verboten
- **`server/lib/resonanzLog.ts`**: fire-and-forget Logging aller AI-Antworten als Markdown ins Repo via GitHub-Contents-API
  - 4 Endpunkte: `/api/ask`, `/api/analyse-pair`, `/api/graph-chat`, `/api/enkidu`
  - Frontmatter: `id`, `ts`, `created_at`, `endpoint`, `anchor`, `nodeIds`, `status`, `content_hash`, `copyright`, `license`, `audit_trail`, `context_meta`
  - Kategorisierte Ordnerstruktur: `content/resonanzen/raw/<endpoint>/<anchor-subdir>/<datum>-<id>.md`
  - Anker-Konvention: `chapter:<id>`, `analyse:<idA>+<idB>`, `graph`, `enkidu`
- **History-Log** (`content/history/`): drei Schichten
  - `snapshots/<datum>.json` — tägliche Aggregat-Übersicht
  - `manifests/<datum>.jsonl` — Tagesindex aller Events
  - `ledger/<jahr>-Q<n>.jsonl` — append-only Quartals-Stream mit Dedup
- **`scripts/snapshot-history.ts`** + GitHub Action `daily-history-snapshot.yml` (Cron 03:00 UTC + manuell)

## Was bisher schon auf dem Branch war

- **Begriffsnetz**: View-Modi (Netz/Cluster/Baum/Matrix), Pfad-Explorer, Spannungsfeld-Analyse, Kohärenz-Metrik, Lesepfad/2-Hop/Top-Hubs, Mobile Bottom-Sheets, Auto-Close beim View-Wechsel, Graph-Chat
- **Enkidu-Chat**: Multi-Turn, Analytics-Screen mit Wortwolke/Resonanzpfad/Themenbalance
- **Corporate Design**: Hell/Dunkelmodus für Begriffsnetz + Enkidu
- **A11y Quick Wins**: lang-Attribut auf `de`, globaler `:focus-visible`-Indikator, Alt-Text-Korrektur

## Production-Voraussetzungen vor Merge

Diese env vars müssen in **Render** gesetzt sein, sonst läuft das Resonanz-Logging fail-soft (kein Schaden, nur kein Effekt):

- `GITHUB_TOKEN` — fine-grained PAT mit `Contents: Read+Write` auf diesem Repo ✅ bereits gesetzt
- `GEMINI_API_KEY` — bereits vorhanden ✅

Optional (Defaults sind richtig):
- `GITHUB_REPO_OWNER` (default `marksen23`)
- `GITHUB_REPO_NAME` (default `digitale-transformation-ebook`)
- `GITHUB_REPO_BRANCH` (default `main`)

## Test plan

- [ ] Render-Deploy erfolgreich (Auto-Deploy nach Merge)
- [ ] Test-Call `/api/graph-chat` über netlify.app — File in `content/resonanzen/raw/graph-chat/`
- [ ] Test-Call `/api/ask` mit chapterId — File in `content/resonanzen/raw/chapter/<chapterId>/`
- [ ] Test-Call `/api/analyse-pair` — File in `content/resonanzen/raw/analyse/<idA>+<idB>/`
- [ ] Test-Call `/api/enkidu` — File in `content/resonanzen/raw/enkidu/`
- [ ] Manueller Trigger der `daily-history-snapshot` Action — Snapshot/Manifest/Ledger erscheinen
