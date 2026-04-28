# History-Log — lückenlose Nachvollziehbarkeit des Resonanz-Korpus

Drei Schichten, automatisch täglich um 03:00 UTC durch GitHub Action
`.github/workflows/daily-history-snapshot.yml` generiert (oder manuell
via `pnpm tsx scripts/snapshot-history.ts`).

## Schichten

```
content/history/
├── snapshots/         ← tägliche Aggregat-Snapshots (Übersicht)
│   └── YYYY-MM-DD.json
│       counts pro endpoint, status_distribution, top_tags,
│       top_anchors, top_hubs, total_files, corpus_hash
│
├── manifests/         ← Tagesindex aller Events (Detail)
│   └── YYYY-MM-DD.jsonl
│       eine Zeile pro Event (created, edited, approved, published)
│
└── ledger/            ← langfristiger Event-Stream (Audit)
    └── YYYY-Qn.jsonl
        Append-only, alle Events des Quartals
```

## Verwendung

**„Wie sah der Korpus am 15. Mai aus?"**
→ `content/history/snapshots/2026-05-15.json` lesen

**„Was passierte am 15. Mai im Detail?"**
→ `content/history/manifests/2026-05-15.jsonl` durchgehen

**„Audit über mehrere Monate"**
→ `content/history/ledger/2026-Q2.jsonl` filtern

**„Korpus-Stand an einem beliebigen Zeitpunkt rekonstruieren"**
→ `git checkout <commit>` zum gewünschten Datum, dann `content/`
   inspizieren

## Garantien

- **Idempotent**: das Skript kann beliebig oft am selben Tag laufen
  ohne Duplikate zu erzeugen.
- **Append-only Ledger**: einmal geschriebene Events werden nicht
  überschrieben. Nur neue Events werden angehängt.
- **Hash-Chain durch Git**: jeder Snapshot ist ein eigener Commit,
  der Vorgänger-Hash referenziert. Tampering wird sichtbar.
- **Inhalts-Hash pro Snapshot**: `corpus_hash` ist deterministisch
  aus allen File-Hashes berechnet. Zwei Snapshots mit identischem
  `corpus_hash` haben denselben Korpus.

## Lizenz

Diese History-Files unterliegen derselben Lizenz wie der Rest des
Werks — siehe LICENSE im Repo-Root.
