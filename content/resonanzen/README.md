# Resonanzen — Korpus aus AI-Antworten und Leserbeiträgen

Dieser Ordner sammelt strukturierte Resonanz-Beiträge aus den vier
AI-Endpunkten der App (Phase 2 der Resonanz-Architektur).

## Struktur

```
content/resonanzen/
├── raw/                          ← automatisch geschriebene Roh-Logs
│   ├── chapter/<chapterId>/      ← /api/ask, ein Ordner pro Kapitel
│   ├── analyse/<idA>+<idB>/      ← /api/analyse-pair, ein Ordner pro Knotenpaar
│   ├── graph-chat/               ← /api/graph-chat, flach
│   └── enkidu/                   ← /api/enkidu, flach
├── pending/                      ← (Phase 3) zur Approval vorgelegt
└── published/                    ← (Phase 3) im Public Feed sichtbar
```

Die Verzeichnisstruktur dient als logisches Breadcrumb: aus dem Pfad
allein lässt sich Kategorie + Kontext (welches Kapitel, welche Knoten)
ablesen, ohne das Frontmatter zu öffnen.

## Datei-Format

Jeder Eintrag ist eine Markdown-Datei mit YAML-Frontmatter. Beispiel:

```yaml
---
id: <ULID-ähnliche-ID>
ts: 2026-04-27T14:23:45.123Z
endpoint: chapter | analyse | graph-chat | enkidu
model: gemini-2.5-flash
anchor: chapter:band2-kap3   # kanonischer Werk-/Konzept-Anker
nodeIds: []                  # bei analyse/graph-chat: Konzept-IDs
status: raw                  # raw → pending → approved → published
content_hash: sha256-prefix
audit_trail:
  - event: created
    ts: ...
    actor: system
    content_hash: ...
context_meta:
  ...
---

## Frage
[User-Anfrage]

## Antwort
[KI-Antwort]
```

## Anker-Konvention

| Endpunkt | Anker-Format | Beispiel |
|---|---|---|
| `/api/ask` (Kapitel-Q&A) | `chapter:<chapterId>` | `chapter:band2-kap3` |
| `/api/analyse-pair` (Spannungsfeld) | `analyse:<idA>+<idB>` (alphabetisch) | `analyse:resonanzvernunft+zwischen` |
| `/api/graph-chat` (Dialog) | `graph` | `graph` |
| `/api/enkidu` (Begegnung) | `enkidu` | `enkidu` |

## Persistenz

Logging läuft fire-and-forget direkt ins GitHub-Repo via `/repos/.../contents`-API
(`server/lib/resonanzLog.ts`). Konfiguration via Render env vars:

- `GITHUB_TOKEN` (Pflicht): fine-grained PAT mit `Contents: Read+Write` auf diesem Repo
- `GITHUB_REPO_OWNER` (default: `marksen23`)
- `GITHUB_REPO_NAME` (default: `digitale-transformation-ebook`)
- `GITHUB_REPO_BRANCH` (default: `main`)

Fehlt der Token (lokale Dev-Umgebung), läuft die App normal — es wird nur
nichts geloggt (Fail-soft).

## Audit-Trail

Zwei redundante Audit-Schichten:

1. **Im Frontmatter**: `audit_trail`-Liste mit Events (created, edited,
   approved, published) inkl. `content_hash` und `actor`.
2. **In Git**: jeder Schreibvorgang ist ein Commit. Hash-Chain durch Git
   selbst, optional signierbar via GPG/SSH (`git commit -S`).
