# Konnektivitäts-Check fürs Begriffsnetz

**Auslöser:** Ein Pfad-Vergleich (`path-analyse/lm-grenze+werden/2026-11-11-MWCATA4K-58BFC31C.md`)
stellte die Frage, welche Verbindungen sichtbar werden, wenn man „Grenze" als
Ausgangspunkt liest. Die Analyse des realen Graphen ergab: **6 der 50 Knoten sind
vom Hauptnetz aus unerreichbar** — die gesamte Erkenntnisprinzipien-Ebene
(`schatten`, `licht`, `weltfaltung`, `raumfaltung`, `wirklichkeit`, `moeglichkeit`).

Das war bislang unsichtbar, weil nichts die Zusammenhangskomponenten prüft:
`validate-resonanzen.ts` kontrolliert `danglingLinks` im Korpus, aber niemand
kontrolliert das Begriffsnetz selbst.

**Entscheidung:** Nicht die fehlenden Kanten setzen (= inhaltliche Begriffsarbeit,
bleibt beim Autor), sondern die Wurzelursache beheben: den Check bauen, der solche
Lücken beim Entstehen meldet.

## Plan

- [x] Graphstruktur verifizieren (ungerichtet, 50 Knoten, 115 Kanten)
- [x] Konventionen bestehender Check-Scripts lesen
- [x] `scripts/check-concept-graph.ts` schreiben
- [x] In `package.json` als `check:graph` eintragen
- [x] In `.github/workflows/validate-corpus.yml` einhängen
- [x] Lokal ausführen + Ergebnis gegen die manuelle Analyse gegenprüfen
- [x] `pnpm check` grün
- [x] Commit + Push + Draft-PR

## Severity-Design

| Befund | Stufe | Begründung |
|---|---|---|
| Kante zeigt auf nicht existierenden Knoten | **alarm** (exit 1) | eindeutiger Datenfehler |
| Doppelte Kante innerhalb derselben Schicht | **alarm** (exit 1) | Copy-Paste-Fehler |
| Knoten ganz ohne Kante | warning | kann Absicht sein |
| Abgetrennte Komponente | warning | kann Absicht sein |
| Promoted edge dupliziert statische Kante | warning | Datenhygiene, harmlos zur Laufzeit |

Bewusst **kein** Fail bei Isolation: die 6 Prinzip-Knoten sind heute abgetrennt,
ein Alarm würde die CI sofort rot färben. Ob die Faltungs-Ebene angebunden gehört,
ist eine Begriffsentscheidung, keine Bug-Meldung.

## Review

### Was entstanden ist

| Datei | Zweck |
|---|---|
| `scripts/lib/concept-graph-utils.ts` | reine Topologie-Rechnung, ohne IO |
| `scripts/check-concept-graph.ts` | IO-Hülle: Schichten laden, Report, Exit-Code |
| `scripts/__tests__/concept-graph-utils.test.ts` | 15 Tests, inkl. aller Alarm-Pfade |
| `client/public/concept-graph-report.json` | Report (versioniert wie die anderen) |

Verdrahtet in `package.json` (`check:graph`), im CI-Workflow als eigener Step,
in der Staging-Liste, in `is_generated_path` und in den Trigger-Pfaden.

### Was der Check beim ersten Lauf fand

Er reproduziert die manuelle Analyse exakt (50 Knoten, 6 unerreichbar) **und
fand eine echte Dublette, die ich übersehen hatte**: `bewusstsein ↔ selbst` stand
doppelt in `EDGES` (Zeile 635 im Self-Cluster, Zeile 656 im Knowledge-Cluster).
Entfernt — da das Netz ungerichtet ausgewertet wird, ändert das nichts an der
Topologie. Genau dafür war der Check gedacht.

### Verifikation

- `pnpm tsx scripts/check-concept-graph.ts` → exit 0, status `warning`
- `pnpm vitest run` → 45 Files, 350 Tests grün
- `pnpm check` → **2 Fehler, beide vorbestehend** (`client/src/components/ui/calendar.tsx:85`,
  `server/lib/claudeClient.ts:65`). Per `git stash` gegen unveränderten HEAD
  gegengeprüft: identisch. Meine Dateien erzeugen null TS-Fehler.
  CLAUDE.md fordert grünes `pnpm check` vor jedem Commit — diese Vorgabe ist
  auf `main` aktuell verletzt, unabhängig von dieser Änderung.

### Offen (bewusst nicht erledigt)

- Die 6 Prinzip-Knoten anbinden — inhaltliche Begriffsarbeit, Entscheidung des Autors.
  Auffälligster Kandidat: `lm-grenze` beschreibt sich selbst als „das Mögliche in das
  Wirkliche", die Knoten `moeglichkeit`/`wirklichkeit` existieren, aber keine Kante.
- `freiheit ↔ lm-grenze` aus `concept-edges.json` entfernen — tote Dublette. Nicht
  angefasst, weil der Server diese Datei schreibt; Entfernen könnte mit Server-State
  kollidieren. Bleibt als Warnung sichtbar.
