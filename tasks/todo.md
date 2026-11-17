# Tote Dublette beseitigen — und die Ursache, die sie erzeugt hat

## Korrektur einer eigenen Fehlannahme

Ich habe zweimal behauptet, `freiheit ↔ lm-grenze` aus `concept-edges.json`
per Commit zu entfernen könne „mit Server-State kollidieren". **Das ist
falsch**, und der Code zeigt es:

- `conceptEdges.ts:fetchEdges` holt die Datei bei **jedem** Aufruf frisch von
  GitHub (`GET …/contents/…?ref=main`).
- Der Server hält **keinen** eigenen Zustand der Kantenliste.
- `promoteEdge` **hängt nur an** (`[...file.edges, edge]`), es schreibt die
  Liste nie aus einer anderen Quelle neu.

Ein Commit, der einen Eintrag entfernt, kollidiert also mit nichts.

## Die eigentliche Ursache

`promoteEdge` dedupliziert **nur gegen `concept-edges.json`**, nicht gegen den
statischen Kanon in `conceptGraph.ts`. Genau so konnte `freiheit ↔ lm-grenze`
erhoben werden, obwohl die Kante in `LEITMOTIV_EDGES:727` längst stand. Ohne
Fix passiert das beim nächsten Promote wieder.

Serverseitig ist der Kanon verfügbar: `graphContext.ts` importiert `NODES` und
`EDGES` bereits.

## Plan

- [x] `graphContext.ts`: `canonicalEdgeKeys` exportieren (EDGES ∪ LEITMOTIV_EDGES)
- [x] `conceptEdges.ts`: `promoteEdge` nimmt `canonicalKeys`, erkennt Kanon-Treffer
- [x] `admin.ts`: Set durchreichen, `canonical` in der Antwort ausweisen
- [x] Die tote Dublette aus `concept-edges.json` entfernen
- [x] Tests für beide Dedup-Wege (JSON-Dublette + Kanon-Dublette)
- [x] `check:graph` muss **ohne jede Warnung** durchlaufen
- [x] `pnpm check` + `pnpm test`

## Entwurfsentscheidung

Kanon-Treffer ist **kein Fehler**, sondern ein No-op-Erfolg mit `already: true`
— genauso wie eine bereits erhobene Kante. Begründung: die Verbindung, die der
Admin will, existiert ja. Ein 400 wäre irreführend. Zusätzlich `canonical: true`,
damit die Oberfläche „steht schon im Kanon" von „schon erhoben" unterscheiden kann.

## Review

### Ergebnis

`check-concept-graph.ts` meldet erstmals **`status: ok`** — 50 Knoten,
138 Kanten, 1 Komponente, 0 isolierte Knoten, **keine einzige Warnung**.

| | vorher | nachher |
|---|---|---|
| Erhobene Kanten (`concept-edges.json`) | 7 | **6** |
| Warnungen im Wächter | 1 | **0** |
| Tests | 350 | **362** (12 neue) |

### Sichtbare Folge

`freiheit ↔ lm-grenze` wurde bisher **zweimal** gezeichnet: als gestrichelte
statische Leitmotiv-Kurve und zusätzlich als solide Akzent-Kurve der
Wachstums-Schicht. Jetzt nur noch als statische. Die Verbindung bleibt also
sichtbar — sie gibt sich nur nicht mehr als „gewachsen" aus, was sie nie war.
Im Browser gegengeprüft: 138 `<path>`, keine Konsolenfehler.

### Was der Fix verhindert

Ohne die Kanon-Prüfung hätte der nächste Promote derselben Verbindung die
Dublette sofort wieder erzeugt. `promoteEdge` bricht jetzt **vor** dem ersten
Netzwerk-Aufruf ab, wenn die Kante statisch existiert — kein GET, kein PUT.
Die Tests prüfen genau das (`expect(calls).toEqual([])`), in beiden
Richtungen, und dass eine echte neue Kante weiterhin durchgeht.

### Offen

Nichts mehr aus dieser Kette. Der Wächter läuft sauber durch.
