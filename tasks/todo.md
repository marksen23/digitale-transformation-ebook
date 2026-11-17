# Die abgetrennten Prinzip-Knoten ans Netz anbinden

**Auftrag:** „Bitte übernehmen Sie die Kanten" — die 6 Erkenntnisprinzipien,
die `check-concept-graph.ts` als vom Hauptnetz getrennt meldet, anschließen.

**Methode:** Keine erfundene Philosophie. Jede Kante muss sich auf einen Satz
stützen, der **bereits im Werk steht** — meist in der Beschreibung eines der
beiden beteiligten Knoten. Was dort nicht steht, wird nicht gezogen.

## Belegte Kanten

### Schattenlicht-Ebene (`schatten`, `licht` — bisher ganz ohne Kante)

| Kante | Beleg |
|---|---|
| `lm-spiegel ↔ schatten` | lm-spiegel: „Erkenntnis entsteht im Zwischenraum von **Licht und Schatten**" |
| `lm-spiegel ↔ licht` | dieselbe Stelle; „das Licht des Spiegels ist geborgt" |
| `lm-scheitern ↔ schatten` | lm-scheitern: „der **Schatten** des Scheiterns ist kein Dunkel" |
| `lm-scheitern ↔ licht` | lm-scheitern: „der Raum, aus dem neues **Licht** entstehen kann" |
| `schatten ↔ erkenntnis` | schatten: „Das Schattenlicht-Prinzip: **Erkennen** entsteht im Kontrast" |

### Faltungs-Ebene (`weltfaltung`, `raumfaltung`, `wirklichkeit`, `moeglichkeit`)

| Kante | Beleg |
|---|---|
| `lm-grenze ↔ moeglichkeit` | lm-grenze: „An der Grenze faltet sich … **das Mögliche** in das Wirkliche" |
| `lm-grenze ↔ wirklichkeit` | dieselbe Stelle: „das Mögliche in **das Wirkliche**" |
| `lm-begegnung ↔ wirklichkeit` | lm-begegnung: „**Wirklichkeit** faltet sich im Augenblick der Begegnung" |
| `lm-begegnung ↔ moeglichkeit` | lm-begegnung: „das **Mögliche** wird zur Gegenwart durch das Wagnis der Begegnung" |
| `lm-begegnung ↔ weltfaltung` | weltfaltung: „Möglichkeiten, die … **durch Begegnung** aktualisiert werden" |
| `lm-begegnung ↔ raumfaltung` | raumfaltung: „jeder Akt der **Begegnung** faltet einen neuen Raum auf" |
| `lm-verwandlung ↔ weltfaltung` | lm-verwandlung: „Schattenlicht und **Faltung zur Wirklichkeit** vereinen sich" |
| `raumfaltung ↔ raum` | raumfaltung: „faltet einen neuen **Raum** auf" |
| `raumfaltung ↔ denken` | raumfaltung: „**Denken** als Weltfaltung" |
| `wirklichkeit ↔ moment` | wirklichkeit: „die im **Augenblick** verdichtete Möglichkeit" |

15 Kanten. Kanten mit `lm-*`-Endpunkt gehören nach `LEITMOTIV_EDGES`
(Resonanz, thematisch), die übrigen vier nach `EDGES`.

## Bewusst NICHT gezogen

- `schatten ↔ licht` — wird bereits von `PRINZIP_PAIRS` als Paarlinie
  gezeichnet; eine zweite Kante würde doppelt rendern.
- `raumfaltung ↔ moeglichkeit` („erzeugt damit neue Möglichkeiten") und
  `moeglichkeit ↔ werden` (beide: „des Lebendigen") — belegt, aber innerhalb
  bereits verbundener Bereiche. Nicht nötig für den Anschluss, und jede Kante
  verändert Gravitation und Pfadsuche. Als Option im PR genannt.

## Plan

- [x] Rendering prüfen (Prinzip-Knoten sind nicht toggle-gegattert)
- [x] Belege aus den Beschreibungen ziehen
- [x] 15 Kanten eintragen
- [x] `check:graph` → muss 1 Komponente, 0 isolierte Knoten melden
- [x] `pnpm check` + `pnpm test`
- [x] Visuell im laufenden Begriffsnetz prüfen (Screenshot)
- [x] Commit + Push + PR

## Review

### Topologie vorher / nachher

| | vorher | nachher |
|---|---|---|
| Von `lm-grenze` erreichbar | 44 / 50 | **50 / 50** |
| Zusammenhangskomponenten | 4 | **1** |
| Isolierte Knoten | 2 | **0** |
| Grad von `lm-grenze` | 6 | **8** |
| Grenze auf einem kürzesten Weg | 8,3 % der Paare | **11,1 %** |

`check-concept-graph.ts` meldet nur noch die bekannte tote Dublette in
`concept-edges.json` — kein Isolations-Befund mehr.

### Visuell verifiziert

Dev-Server + Playwright gegen `/begriffsnetz`:
- 136 `<path>` im SVG = exakt die 136 Kanten, 50 Labels, **keine Konsolenfehler**
- `Schatten` angeklickt: zeigt **3 verbundene Begriffe** (Einsicht, SPIEGEL,
  SCHEITERN) und eine Integrations-Metrik — vorher war der Knoten klick-tot.
- `Grenze` gesucht: zeigt **8 verbundene Begriffe**, darunter jetzt
  **Möglichkeit** und **Wirklichkeit**. Der Satz „das Mögliche in das
  Wirkliche" steht im Panel unmittelbar über den Begriffen, die er benennt.
- Die zwei langen Querkanten (`lm-grenze↔wirklichkeit`,
  `lm-begegnung↔moeglichkeit`) stören nicht: Leitmotiv-Kanten liegen im
  Ruhezustand bei 0.18 Deckkraft und treten erst im Fokus hervor.

### Unerwarteter Beleg aus dem eigenen Korpus

Das Panel von `Schatten` listet unter „Begegnungen aus dem Wissen" u. a.
`Triade: Schatten · Licht · Transformatives Drittes`,
`Quadratur: Scheitern · Schweigen · Licht · Schatten` und
`Spannungsfeld: Schatten ↔ Begegnung`.

Der Korpus hat Schatten also längst mit Licht, Scheitern und Begegnung
zusammengedacht — **genau die Kanten, die jetzt gezogen wurden**. Das Netz
hinkte seinem eigenen Korpus hinterher. Die Kanten sind damit doppelt belegt:
aus der Prosa der Beschreibungen und aus den Querverweisen des Korpus.

### Nachtrag: die drei zurückgestellten Kanten (auf Zuruf gezogen)

| Kante | Belegtyp |
|---|---|
| `raumfaltung ↔ moeglichkeit` | Zitat: „erzeugt damit **neue Möglichkeiten**" |
| `moeglichkeit ↔ werden` | geteilte Wendung „des Lebendigen" — keine wechselseitige Nennung |
| `weltfaltung ↔ welt` | **morphologisch**, nicht zitatgestützt: keine der beiden Beschreibungen nennt die andere |

Die dritte Kante trägt einen anderen Belegtyp als die 15 vorigen. Das steht als
Kommentar an der Kante selbst, damit sie überprüfbar bleibt und nicht als
zitatgestützt durchgeht.

Stand danach: 139 Kanten, 1 Komponente, 0 isolierte Knoten. Im laufenden
Begriffsnetz gegengeprüft: 139 `<path>` im SVG, keine Konsolenfehler.

### Offen

- `freiheit ↔ lm-grenze` in `concept-edges.json` — tote Dublette, unverändert.
