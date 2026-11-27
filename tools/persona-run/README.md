# Persona-Lauf

Hier liegen die Vorlage und die Dichte-Snapshots des täglichen Leser-Laufs.
Der Lauf selbst bleibt außerhalb dieses Ordners: er spricht die öffentliche
Seite an und braucht dafür keine Datei mit einem Schlüssel im Repo.

## Was ein Lauf tut

Ein Lauf geht die öffentlichen Lese-Flächen ab. Jede Antwort schreibt der
Server als `log(resonanz)` nach `content/resonanzen/raw/{endpoint}/…`,
sobald auf Render `GITHUB_TOKEN` gesetzt ist. Danach baut
`validate-corpus` den Index neu.

Übliche Flächen, alle schon rate-limited:

| Fläche | Route |
|---|---|
| Begriffspaar, Triade | `POST /api/analyse-cluster` |
| Pfad | `POST /api/analyse-path` |
| Dialog, Weiterdenken | `POST /api/dialog/persist`, `POST /api/weiterdenken` |
| Graph-Chat | `POST /api/graph-chat` |
| Enkidu | `POST /api/enkidu` |
| Passage | `POST /api/passage-resonanz` |
| Kapitel | `POST /api/ask` |

`POST /api/translate` ist kein Korpus-Beitrag und gehört nicht in den Lauf.

## Tageszeiten auf `main` (UTC)

| Uhrzeit | Lauf |
|---|---|
| 03:00 | History-Snapshot |
| 04:00 | Auto-Kuratierung, nur mit Repo-Secret `ADMIN_TOKEN` |
| Sonntag 05:00 | Erkenntnisse neu erzeugen |
| 06:30 | Frische-Alarm: kein neuer `log(resonanz)` seit über 48 Stunden öffnet ein Issue mit Label `monitoring` |

## Diese Vorlage

`plan.example.json` ist ein Beispiel mit echten Begriffs-ids und ohne Texte,
die jemand gesagt hat. Prüfen und die Zählung anzeigen:

```bash
pnpm exec tsx tools/persona-run/run.ts
```

Dieselbe Zählung nach `snapshots/YYYY-MM-DD.json` schreiben:

```bash
pnpm exec tsx tools/persona-run/run.ts --write
```

Die Datei enthält nur Datum, Schrittarten und Begriffszählungen. Ein eigener
Plan liegt daneben oder unter `PERSONA_PLAN`. `local/` ist gitignoriert.

Snapshots mit genau dieser Form dürfen ins Repo. Nicht committen: Schlüssel,
Tokens, Adressen, Prompt-Journale, Rohantworten.
