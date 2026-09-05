# Plan: Multi-Marktplatz Produkt-Listing-App

> **Hinweis zur Einordnung:** Dieses Dokument ist ein eigenständiger Produkt-
> und Architekturplan für eine App, die mit dem eBook-Projekt in diesem
> Repository inhaltlich nichts zu tun hat. Es wurde auf dem dafür
> angelegten Branch abgelegt, damit der Plan versioniert und referenzierbar
> ist.
>
> **Wichtiger Hinweis zur Verlässlichkeit einzelner Angaben:** Bei den
> Abschnitten zu konkreten Marktplatz-APIs (Verfügbarkeit, Limits,
> Freigabeprozesse, Gebühren) gebe ich meinen Kenntnisstand wieder, der
> veraltet oder unvollständig sein kann — API-Programme, Gebührenmodelle
> und Freigabe-Voraussetzungen ändern sich häufig und ohne Ankündigung.
> Überall dort, wo ich unsicher bin, kennzeichne ich das explizit als
> Vermutung bzw. als "zu verifizieren". Vor dem Start der Umsetzung muss
> jede Marktplatz-Integration gegen die aktuelle offizielle
> Entwickler-Dokumentation des jeweiligen Anbieters geprüft werden — dieser
> Plan ersetzt das nicht.

---

## 1. Vision

Eine App, mit der ein Verkäufer (Privatperson oder kleiner Händler) **ein
Produkt einmal fotografiert und beschreibt** und die App daraus automatisch
**passende Anzeigen für mehrere Online-Marktplätze gleichzeitig erstellt und
veröffentlicht** — inklusive KI-gestützter Bildanalyse, Text- und
Titel-Generierung, marktplatzspezifischer Formatierung (Bildgrößen,
Zeichenlimits, Kategorie-Zuordnung, Pflichtfelder) und automatischem
Publishing über die jeweiligen Schnittstellen.

**Kernversprechen:** Aus "ein Foto + ein paar Stichworte" wird in wenigen
Minuten eine vollständige, marktplatzoptimierte Anzeige auf mehreren
Plattformen gleichzeitig — statt das Produkt manuell 3–5 Mal in
unterschiedliche Formulare einzutragen.

---

## 2. Zielgruppe & Nutzungsszenarien

- **Privatverkäufer** (Kleiderschrank ausmisten, Second-Hand, Umzug):
  wollen mit minimalem Aufwand maximale Reichweite über mehrere
  Kleinanzeigen-/Second-Hand-Plattformen.
- **Kleine/mittlere Online-Händler** (Etsy-Shops, kleine Amazon/eBay-
  Seller): wollen ihr Sortiment über mehrere Vertriebskanäle gleichzeitig
  pflegen, ohne jeden Kanal einzeln zu bespielen.
- **Resale-/Vintage-Händler**: hohe Stückzahl, hohe Foto-Frequenz,
  brauchen Tempo pro Listing.

**Kernschmerzpunkt, den die App löst:** Cross-Listing ist heute überwiegend
manuelle Fleißarbeit (Copy-Paste in mehrere Formulare, unterschiedliche
Bildzuschnitte, unterschiedliche Kategoriebäume) — dazu kommt fehlende
Synchronisation (verkauft auf Plattform A, aber Anzeige auf B/C/D bleibt
sichtbar → Doppelverkäufe, Reklamationen).

---

## 3. Kern-User-Journey

1. **Foto-Erfassung**: Nutzer fotografiert das Produkt (mehrere Fotos,
   idealerweise mit Vorgaben: Hauptmotiv, Detail, Etikett/Größe, Mängel).
2. **KI-Bildanalyse**: App erkennt automatisch
   - Produktkategorie (z. B. "Damen-Jacke", "Kaffeemaschine", "Sofa")
   - relevante Attribute (Marke/Logo falls erkennbar, Farbe, Material,
     ggf. Größe/Modellbezeichnung aus Etikett-Foto via OCR)
   - sichtbaren Zustand (neuwertig / gebraucht / Mängel wie Flecken,
     Kratzer — als Vorschlag, nicht als verbindliche Zusicherung)
   - schneidet/optimiert Bilder automatisch zu (Freistellen,
     Weißabgleich, Zuschnitt je nach Marktplatzvorgabe)
3. **Automatischer Anzeigen-Entwurf**: App generiert
   - Titel (marktplatzspezifisch, inkl. Zeichenlimit)
   - Beschreibungstext (Tonalität je Plattform: sachlich/SEO-orientiert
     für Amazon/Etsy, persönlicher für Kleinanzeigen-Plattformen)
   - Kategorie-Zuordnung je Marktplatz-Taxonomie
   - Preisvorschlag (auf Basis vergleichbarer aktiver/verkaufter Angebote,
     wo die jeweilige API das hergibt)
4. **Review & Freigabe durch den Nutzer** (wichtig — siehe Abschnitt 13:
   rechtlich muss der Verkäufer die Angaben bestätigen, keine
   Blindveröffentlichung von KI-Text ohne Prüfung, insbesondere bei
   Zustandsangaben/Mängeln).
5. **Auswahl der Zielmarktplätze** pro Listing (nicht jedes Produkt passt
   auf jede Plattform — z. B. Möbel eher lokal/Kleinanzeigen, Mode eher
   Vinted/eBay/Etsy).
6. **Publishing**: App schickt die formatierte Anzeige über die jeweilige
   API/Schnittstelle an die ausgewählten Marktplätze.
7. **Status-Dashboard**: zentrale Übersicht aller Listings über alle
   Plattformen — online/Entwurf/Fehler/verkauft.
8. **Cross-Sync bei Verkauf**: wird ein Artikel auf einer Plattform als
   verkauft markiert, werden die übrigen Listings automatisch deaktiviert
   bzw. auf "reserviert/verkauft" gesetzt (End-to-End nur dort möglich, wo
   die API das unterstützt oder der Verkäufer den Verkauf manuell
   bestätigt).

---

## 4. Marktplatz-Machbarkeitsanalyse (zentrale Weichenstellung)

Das ist der wichtigste Abschnitt für die Produktentscheidung, denn **nicht
jeder wünschenswerte Marktplatz bietet eine offizielle API für
Drittanbieter-Listing-Automatisierung**. Das bestimmt maßgeblich, was
technisch und rechtlich überhaupt machbar ist.

### 4a. Plattformen mit (nach meinem Kenntnisstand) offiziellen Verkäufer-/Listing-APIs

Diese Angaben sind mit mittlerer bis hoher Zuversicht, aber Details
(genaue Freigabekriterien, Kosten, Rate-Limits) unbedingt gegen die
aktuelle Doku prüfen:

- **eBay** — bietet eine offizielle "Sell"-API-Familie (u. a. Inventory
  API, Fulfillment API) für Drittanbieter/Entwickler, mit OAuth-basierter
  Autorisierung je Verkäuferkonto. Erfahrungsgemäß existiert ein
  Entwicklerprogramm mit Antrags-/Freigabeprozess für produktive Nutzung.
- **Amazon** — bietet die **Selling Partner API (SP-API)** für Verkäufer,
  ebenfalls mit Antrags-/Zulassungsprozess (u. a. Nachweis eines
  bestehenden Verkäuferkontos, ggf. Rollen-/Nutzungsfall-Prüfung durch
  Amazon).
- **Etsy** — bietet eine offene Entwickler-API (Etsy Open API) für
  Listing-Verwaltung, mit App-Registrierung und OAuth.
- **Shopify** (falls Nutzer einen eigenen Shop betreiben) — offene
  Admin-API, sehr gut dokumentiert, kein Sonderfreigabeprozess für Standard-
  Nutzung nötig.
- **WooCommerce/eigene Shopsysteme** — REST-API standardmäßig vorhanden.
- Einzelne größere Marktplätze mit explizitem "Marketplace/Partner API"-
  Programm (z. B. Otto Market, Kaufland.de Marketplace, Real.de,
  Check24-artige Marktplätze) bieten in der Regel API-Zugänge **speziell
  für gewerbliche Händler mit Vertrag**, nicht für Privatverkäufer. Das
  sollte pro Zielmarkt einzeln geprüft werden — ich habe hierzu keinen
  verlässlichen, aktuellen Überblick über exakte Konditionen.

### 4b. Plattformen ohne (nach meinem Kenntnisstand) öffentliche Listing-API für Drittanbieter

Das betrifft insbesondere die für Privatverkäufer/Second-Hand wichtigsten
Plattformen:

- **Kleinanzeigen.de (vormals eBay Kleinanzeigen)** — mir ist keine
  öffentliche, für Drittanbieter-Apps nutzbare API zum automatisierten
  Erstellen/Verwalten von Anzeigen bekannt.
- **Vinted** — mir ist keine offizielle, öffentlich zugängliche
  Verkäufer-API für Drittanbieter bekannt.
- **Facebook/Meta Marketplace** — Meta bietet Commerce-/Catalog-APIs für
  Shops/Kataloge, aber nach meinem Kenntnisstand keine offene API zum
  Erstellen klassischer privater "Marketplace"-Kleinanzeigen durch
  Drittanbieter-Apps.
- **Marktplaats (NL), willhaben (AT)** und vergleichbare regionale
  Kleinanzeigenportale: mir liegt kein verlässlicher aktueller Stand vor,
  ob und in welchem Umfang es dort Partner-/Entwickler-APIs gibt — das
  müsste einzeln recherchiert werden.

**Konsequenz:** Bekannte kommerzielle Cross-Listing-Tools (z. B. aus dem
Resale-/Vintage-Bereich) lösen die Lücke bei API-losen Plattformen
üblicherweise über **Browser-Automatisierung** (das Tool füllt im
Hintergrund das normale Webformular der Plattform aus) statt über eine
offizielle API. Das ist technisch möglich, aber:

- **rechtlich riskant**: verstößt typischerweise gegen die Nutzungs-
  bedingungen/AGB der jeweiligen Plattform (automatisiertes Erstellen von
  Inhalten, Umgehung von Rate-Limits/Bot-Schutz);
- **technisch instabil**: bricht bei jedem Redesign/A-B-Test der Zielseite,
  erfordert laufende Wartung, ist anfällig für Captchas/Bot-Erkennung;
- **Kontorisiko für den Nutzer**: die Plattform kann das Nutzerkonto bei
  erkannter Automatisierung sperren.

**Empfehlung für den Produktplan:**

1. **MVP strikt auf Plattformen mit offizieller API beschränken** (eBay,
   Etsy, ggf. Amazon, ggf. eigener Shop via Shopify/WooCommerce). Das ist
   die einzige Variante, die technisch robust und rechtlich sauber sofort
   umsetzbar ist.
2. Für API-lose Plattformen (Kleinanzeigen, Vinted, Facebook Marketplace)
   **zunächst nur eine "Formatierungs-Hilfe" anbieten**: die App erzeugt
   den fertigen Text + zugeschnittene Bilder zum **manuellen Copy-Paste**
   durch den Nutzer (inkl. Ein-Klick-Kopieren, vorbefüllte
   Zwischenablage, ggf. Download der Bilder in der richtigen
   Reihenfolge/Größe). Das deckt einen großen Teil des Zeitgewinns ab,
   ohne ToS-Risiko.
3. Browser-Automatisierung für API-lose Plattformen **nur als bewusste,
   spätere Opt-in-Erweiterung** in Betracht ziehen, mit expliziter
   Nutzeraufklärung über das Risiko einer Kontosperre — und nur nach
   erneuter rechtlicher Prüfung der jeweils aktuellen AGB. Ich empfehle,
   diese Entscheidung nicht in der Architektur vorwegzunehmen, sondern
   als eigenen Produkt-/Rechts-Entscheid zu behandeln, bevor daran
   entwickelt wird.
4. **Vor Umsetzungsbeginn**: für jede geplante Zielplattform aktuell und
   direkt bei der Plattform verifizieren, ob/wie ein Entwicklerzugang zu
   bekommen ist, welche Nutzungsbedingungen gelten und ob Privatverkäufer
   überhaupt zulässige Nutzer eines API-Zugangs sind (viele
   Marketplace-APIs sind explizit auf gewerbliche/registrierte Händler
   zugeschnitten).

---

## 5. Funktionsübersicht

### MVP (Phase 1)

- Foto-Upload (Mehrfachbilder pro Produkt)
- KI-Bildanalyse: Kategorie-Vorschlag, Basis-Attribute
- KI-Text-Generierung: Titel + Beschreibung (editierbar)
- Bildaufbereitung: automatischer Zuschnitt/Format je Zielplattform
- Anbindung an 2–3 Plattformen mit offizieller API (z. B. eBay, Etsy)
- Manuelles Review vor Veröffentlichung (Pflichtschritt)
- Zentrales Dashboard: Status pro Listing pro Plattform
- Manuelles "als verkauft markieren" → deaktiviert andere Listings

### Phase 2

- Weitere API-Plattformen (Amazon SP-API, eigener Shop/Shopify)
- Formatierungs-Hilfe (Copy-Paste-Assistent) für API-lose Plattformen
  (Kleinanzeigen, Vinted, Facebook Marketplace)
- Preisvorschlag auf Basis von Vergleichsangeboten
- OCR für Etiketten (Größe, Pflegehinweise, Materialangabe)
- Lagerbestands-/Mengenverwaltung bei Mehrfachartikeln

### Phase 3 (Ausbaustufen)

- Automatische Neu-Bepreisung / Angebots-Auffrischung
- Mehrsprachige Anzeigen (Übersetzung) für internationale Plattformen
- Analytics (welche Plattform verkauft welche Kategorie am besten)
- Team-/Mehrbenutzer-Funktion für kleine Händlerteams
- Automatisierte Rücknahme/Reaktivierung von Angeboten bei Nichtverkauf

---

## 6. Architekturübersicht

```
                         ┌─────────────────────────┐
                         │      Mobile/Web-App       │
                         │  (Foto-Aufnahme, Review,  │
                         │   Dashboard, Freigabe)     │
                         └────────────┬──────────────┘
                                      │ REST/GraphQL (HTTPS)
                         ┌────────────▼──────────────┐
                         │        API-Gateway /       │
                         │        Backend-Service      │
                         └───┬───────────┬────────────┘
                             │           │
              ┌──────────────▼──┐   ┌────▼───────────────┐
              │  KI-Pipeline-    │   │  Marktplatz-        │
              │  Service         │   │  Publishing-Engine  │
              │  - Bildanalyse   │   │  - Adapter pro       │
              │  - Textgenerierg.│   │    Plattform         │
              │  - Bildaufbereit.│   │  - Format-Mapping    │
              │  - Preisvorschlag│   │  - Status-Sync       │
              └───┬──────────────┘   │  - Retry/Queue       │
                  │                  └───┬──────────────────┘
       ┌──────────▼─────────┐            │
       │ Externe KI-Dienste  │   ┌────────▼────────────────┐
       │ (Bildmodell,        │   │  Marktplatz-APIs         │
       │  Sprachmodell,      │   │  (eBay, Etsy, Amazon,     │
       │  OCR)               │   │   Shopify, …)             │
       └─────────────────────┘   └───────────────────────────┘
                             │
                  ┌──────────▼───────────┐
                  │  Datenbank            │
                  │  - Produkte           │
                  │  - Listings           │
                  │  - Marktplatz-Konten  │
                  │  - Medien             │
                  └───────────────────────┘
```

### Komponenten im Detail

- **Mobile/Web-App**: Foto-Aufnahme (native Kamera-Integration auf
  Mobile), Review-UI mit Diff/Editier-Möglichkeit für KI-Vorschläge,
  Plattform-Auswahl, Dashboard.
- **Backend-Service**: Orchestriert den gesamten Ablauf, Auth, Nutzer-
  und Kontenverwaltung, Business-Logik (z. B. welche Kategorie passt zu
  welchen Plattformen).
- **KI-Pipeline-Service**: gekapselt als eigener Service, damit
  Modell-/Anbieterwechsel isoliert bleiben (siehe Abschnitt 8).
- **Marktplatz-Publishing-Engine**: Adapter-Pattern — pro Plattform ein
  Adapter-Modul, das eine gemeinsame interne Listing-Repräsentation in
  das plattformspezifische API-Format übersetzt (siehe Abschnitt 9).
- **Datenbank**: persistiert Produkte, generierte/editierte Listing-
  Inhalte, Plattform-Verknüpfungen und Status-Historie.

---

## 7. Tech-Stack-Vorschlag

Dies ist ein **Vorschlag**, kein zwingender Standard — je nach Team-
Erfahrung sind gleichwertige Alternativen möglich.

- **Mobile/Web-Frontend**: React Native (für native Kamera-Performance
  auf iOS/Android) oder eine React/TypeScript-Web-App mit PWA-Kamera-
  Zugriff, falls kein natives App-Store-Listing gewünscht ist.
- **Backend**: Node.js/TypeScript (Express/Nest.js) oder Python
  (FastAPI) — Python bietet ggf. engere Anbindung an gängige ML-
  Bibliotheken, falls Teile der KI-Pipeline selbst gehostet werden.
- **Datenbank**: PostgreSQL (relational für Produkte/Listings/Konten) +
  Objektspeicher (S3-kompatibel) für Bilder.
- **Job-Queue**: für asynchrones Publishing/Retry (z. B. Redis-basierte
  Queue) — Marktplatz-APIs sind oft rate-limitiert und nicht
  synchron-garantiert.
- **KI-Anbindung**: über externe Multimodal-/Sprachmodell-APIs
  (Bildverständnis + Textgenerierung) statt eigenes Modelltraining —
  deutlich schnellerer Time-to-Market. Konkrete Anbieterwahl ist eine
  separate Entscheidung (Kosten, Datenschutzanforderungen, Sprachqualität
  Deutsch/Englisch je nach Zielmarkt).
- **OAuth-Token-Verwaltung**: verschlüsselte Speicherung
  (KMS/Secrets-Manager je Cloud-Anbieter), kein Klartext in der DB.
- **Hosting**: Cloud-Anbieter nach Wahl (AWS/GCP/Azure) oder schlankere
  PaaS-Lösung (Render, Fly.io) für den MVP, mit Migrationspfad, falls
  Skalierung nötig wird.

---

## 8. Datenmodell (vereinfacht)

```
User
 ├─ id, email, name, subscriptionTier

MarketplaceAccount
 ├─ id, userId, marketplace (enum: ebay, etsy, amazon, …)
 ├─ oauthTokenEncrypted, tokenExpiresAt, status (connected/expired/revoked)

Product
 ├─ id, userId, createdAt
 ├─ category (intern-kanonisch, NICHT plattformspezifisch)
 ├─ attributes (Marke, Farbe, Material, Zustand, Maße, …)
 ├─ basePriceSuggestion

Media
 ├─ id, productId, originalUrl, processedVariants[] (je Plattform-Format)
 ├─ ocrText (falls Etikett erkannt)

Listing
 ├─ id, productId, marketplaceAccountId
 ├─ title, description, priceFinal, categoryMappedId (plattformspezifisch)
 ├─ status (draft/pending_review/published/error/sold/delisted)
 ├─ externalListingId (ID beim Marktplatz nach Veröffentlichung)
 ├─ lastSyncedAt, lastError

AuditLog
 ├─ listingId, action, actor (user/system), timestamp
```

**Wichtiges Designprinzip:** Es gibt **eine kanonische, plattform-
neutrale Produktbeschreibung** (`Product`) und **je Zielplattform ein
eigenes `Listing`**, das aus dem kanonischen Produkt abgeleitet und
plattformspezifisch angepasst wird (eigene Kategorie-ID, eigener Titel-
Zuschnitt, eigenes Bildformat). So bleibt die Quelle der Wahrheit sauber
getrennt von der plattformspezifischen Übersetzung.

---

## 9. KI-Pipeline im Detail

### 9a. Bildanalyse

- **Objekt-/Kategorieerkennung**: Multimodales Bildverständnis-Modell
  ordnet das Hauptmotiv einer internen Kategorie-Taxonomie zu (z. B.
  "Bekleidung > Damen > Jacken"). Die interne Taxonomie muss so gebaut
  sein, dass sie sich auf die Kategoriebäume aller Zielplattformen
  mappen lässt (siehe 9c) — pragmatisch: eigene, mittelgranulare
  Taxonomie als "Zwischenschicht", plus Mapping-Tabelle pro Plattform.
- **Attribut-Extraktion**: Farbe, erkennbares Material, ggf. Marke
  (falls Logo/Schriftzug klar erkennbar — mit Unsicherheits-Kennzeichnung,
  da Markenerkennung fehleranfällig ist und rechtlich heikel, wenn falsch
  zugeschrieben).
- **Zustandserkennung**: Modell gibt einen **Vorschlag** ab (z. B.
  "wirkt neuwertig" / "sichtbare Gebrauchsspuren"), der **immer als
  unverbindlicher Vorschlag** markiert und vom Verkäufer bestätigt werden
  muss — siehe rechtliche Hinweise in Abschnitt 13. Die App darf den
  Zustand niemals eigenständig final in eine veröffentlichte Anzeige
  schreiben, ohne dass der Mensch es bestätigt hat.
- **OCR für Etiketten**: separates Foto vom Größen-/Pflegeetikett wird
  per Texterkennung ausgelesen (Größe, Materialzusammensetzung,
  Pflegehinweise) — reduziert Tippaufwand und erhöht Datenqualität für
  Modeartikel.
- **Bildaufbereitung**: automatischer Zuschnitt auf plattformspezifische
  Seitenverhältnisse/Mindestauflösungen, Helligkeits-/Kontrastkorrektur,
  optional Hintergrund-Freistellung für Produktfotos (nicht immer
  gewünscht bei Second-Hand-Plattformen, wo "echte" Kontextfotos oft
  vertrauenswürdiger wirken — als Nutzeroption, nicht erzwungen).

### 9b. Text-Generierung

- **Titel**: je Plattform-Zeichenlimit und -Konvention (z. B.
  Schlagwort-lastig bei eBay/Etsy-SEO vs. kurz-persönlich bei
  Kleinanzeigen-Formaten).
- **Beschreibung**: Tonalität konfigurierbar je Plattform-Profil
  (sachlich/attributgetrieben vs. persönlich/erzählend), generiert aus
  den extrahierten Attributen + optionalen Freitext-Stichpunkten des
  Nutzers.
- **Pflichtangaben-Erinnerung**: die App muss aktiv prüfen/erinnern, ob
  rechtlich vorgeschriebene Angaben fehlen (z. B. Grundpreis bei
  bestimmten Warengruppen, Textilkennzeichnung, Herstellerangaben) —
  siehe Abschnitt 13. Das ist **keine reine Kür**, sondern reduziert
  Abmahnrisiko für den Nutzer.

### 9c. Kategorie-Mapping-Engine

- Interne Zwischenkategorie ↔ Mapping-Tabelle pro Marktplatz-Taxonomie.
- Mapping-Tabellen müssen gepflegt werden, da sich Marktplatz-
  Kategoriebäume ändern können — als eigene, versionierte
  Konfigurationsdaten behandeln (nicht hart im Code verdrahten).
- Fallback-Strategie, wenn kein eindeutiges Mapping existiert: Nutzer
  wählt manuell aus einer vorgefilterten Liste plausibler Zielkategorien.

### 9d. Preisvorschlag

- Basiert auf aktiven/abgeschlossenen Vergleichsangeboten, **soweit die
  jeweilige API das hergibt** (z. B. eBay bietet historisch Explore-/
  Preisvergleichsdaten in unterschiedlichem Umfang — aktueller Umfang
  vorab prüfen). Wo keine API-Preisdaten verfügbar sind: Preisvorschlag
  entfällt oder basiert nur auf nutzerseitig hinterlegten
  Vergleichswerten — hier keine erfundenen Datenquellen vortäuschen.

---

## 10. Marktplatz-Adapter-Architektur

Jede Plattform bekommt ein eigenes **Adapter-Modul** mit einheitlichem
internem Interface, z. B.:

```
interface MarketplaceAdapter {
  authorize(user): OAuthFlow
  mapCategory(internalCategory): PlatformCategoryId
  mapListing(internalListing): PlatformPayload
  publish(payload): { externalId } | Error
  updateStatus(externalId, status): void
  fetchListingStatus(externalId): Status
  delist(externalId): void
}
```

Vorteile dieses Musters:

- Neue Plattform hinzufügen = neuer Adapter, ohne Kernlogik anzufassen.
- Unterschiedliche Auth-Verfahren (OAuth 2.0 einzelner Plattformen
  unterscheiden sich in Scopes/Refresh-Verhalten) bleiben pro Adapter
  gekapselt.
- Rate-Limit-Handling und Retry-Strategie pro Plattform individuell
  konfigurierbar (manche APIs sind strenger limitiert als andere).

**Publishing-Queue statt Direktaufruf:** Da Marktplatz-APIs
Ratenlimits, Wartezeiten und mögliche Ausfälle haben, sollte Publishing
grundsätzlich **asynchron über eine Job-Queue** laufen, mit:

- Retry mit exponentiellem Backoff bei transienten Fehlern
- klarer Fehlerklassifikation (temporär vs. dauerhaft, z. B.
  "Kategorie ungültig" ist kein Retry-Fall, sondern erfordert
  Nutzer-Korrektur)
- Idempotenz (kein doppeltes Listing bei wiederholtem Retry)

---

## 11. Synchronisation & Cross-Posting-Logik

- **Verkaufsstatus-Sync**: wo die API es unterstützt (Webhooks/Polling
  auf Verkaufsstatus), automatische Benachrichtigung im Backend →
  automatisches Delisting/Deaktivieren der übrigen Listings.
- **Wo keine automatische Statusrückmeldung möglich ist** (z. B. bei
  reinen Formatierungs-Hilfe-Plattformen ohne API): der Nutzer markiert
  manuell "verkauft" im Dashboard → App löst daraufhin Delisting bei den
  API-Plattformen aus und zeigt einen Hinweis/Erinnerung, die
  Anzeige bei den Nicht-API-Plattformen selbst zu löschen.
- **Mengenführung** bei mehreren identischen Artikeln: einfache
  Bestandslogik, die bei Verkauf die verbleibende Menge auf den anderen
  Plattformen aktualisiert statt komplett zu delisten.

---

## 12. Nutzerverwaltung, Auth & Sicherheit

- **OAuth 2.0** pro Marktplatz-Konto, Tokens verschlüsselt gespeichert
  (nie im Klartext, nie im Client), Refresh-Handling pro Adapter.
- **Rollen/Multi-Tenant**: von Anfang an so bauen, dass ein Nutzerkonto
  mehrere Marktplatz-Konten verknüpfen kann; spätere Team-Funktion
  (mehrere Nutzer pro Organisation) als Erweiterung, nicht Nachrüstung
  im Datenmodell nötig, wenn `userId`/`organizationId` von Beginn an
  sauber getrennt modelliert wird.
- **Datenschutz (DSGVO, da deutscher/europäischer Zielmarkt)**:
  - Verarbeitung von Produktfotos ggf. mit externen KI-Diensten →
    Auftragsverarbeitungsvertrag (AVV) mit dem KI-Anbieter prüfen,
    Datenverarbeitung transparent in der Datenschutzerklärung nennen.
  - Keine unnötige Speicherung sensibler Daten (Adress-/Zahlungsdaten
    verbleiben möglichst beim Marktplatz selbst, nicht redundant in der
    eigenen App-DB, wenn nicht zwingend nötig).
  - Löschkonzept für Produktfotos/-daten auf Nutzerwunsch.
- **API-Zugangsdaten der App selbst** (Client-ID/Secret je
  Marktplatz-Entwicklerkonto) sicher in Secrets-Management, nicht im
  Repository.

---

## 13. Rechtliche & Compliance-Aspekte (Deutschland/EU-Fokus)

Dieser Abschnitt beschreibt **worauf zu achten ist**, ersetzt aber keine
Rechtsberatung — vor Launch sollte eine anwaltliche Prüfung erfolgen,
insbesondere weil Verkäufer-Abmahnrisiken im deutschen Online-Handel real
und häufig sind.

- **Keine Blindveröffentlichung von KI-generierten Zustands-/
  Mängelangaben.** Der Verkäufer muss jede automatisch erkannte
  Zustandsaussage aktiv bestätigen, bevor sie live geht — sonst haftet
  im Zweifel der Verkäufer für fehlerhafte KI-Einschätzungen
  gegenüber dem Käufer.
- **Pflichtangaben je Warengruppe** (nicht abschließend, jeweils prüfen):
  - Grundpreisangabe bei bestimmten Warenkategorien
  - Textilkennzeichnung (Faserzusammensetzung) bei Bekleidung
  - Herstelleridentifikation/Sicherheitsangaben bei bestimmten
    Produktkategorien (z. B. Elektro, Spielzeug)
  - Widerrufsbelehrung bei gewerblichem Verkauf (nicht bei
    Privatverkäufen zwischen Privatpersonen, aber relevant, sobald die
    App auch gewerbliche Nutzer anspricht)
- **Marktplatz-eigene AGB/API-Nutzungsbedingungen**: jede Automatisierung
  muss mit den ToS der jeweiligen Plattform vereinbar sein — insbesondere
  bei Plattformen ohne offizielle API (siehe Abschnitt 4b) ist
  Automatisierung typischerweise **nicht** von den Nutzungsbedingungen
  gedeckt.
- **Markenrechte**: automatische Markenerkennung in Bildern darf nicht zu
  falschen/ungeprüften Markenzuschreibungen in der veröffentlichten
  Anzeige führen (Gefahr von Abmahnungen wegen irreführender
  Markennennung oder Markenrechtsverletzung).
- **Verantwortlichkeit für Inhalte**: die App ist technischer
  Dienstleister, der Verkäufer bleibt rechtlich verantwortlich für den
  Anzeigeninhalt — das sollte in den Nutzungsbedingungen der App klar
  geregelt sein, und die Review-Pflicht (Abschnitt 3, Schritt 4) ist
  dafür auch die praktische Absicherung.

---

## 14. Monetarisierung (Vorschlag)

- **Free-Tier**: begrenzte Anzahl Listings/Monat, 1–2 Plattformen.
- **Abo-Modell** (monatlich): unbegrenzte/höhere Listing-Anzahl, alle
  angebundenen Plattformen, Preisvorschlags-Feature.
- **Pro-Listing-Gebühr** als Alternative/Ergänzung für Gelegenheitsnutzer
  ohne Abo.
- **Team-/Business-Tarif** für Händler mit mehreren Nutzern und höherem
  Volumen (Phase 3).

Konkrete Preispunkte hängen von tatsächlichen KI- und API-Kosten pro
Listing ab — sollte erst nach einer Kosten-pro-Listing-Kalkulation im MVP
festgelegt werden, nicht vorab spekulativ.

---

## 15. Technischer Umsetzungsplan (Phasen & grobe Meilensteine)

**Phase 0 — Validierung (vor jeglicher Entwicklung)**

- Für jede geplante Zielplattform: Entwicklerzugang beantragen/prüfen,
  aktuelle API-Doku und Nutzungsbedingungen sichten, Freigabeprozess und
  -dauer klären (manche Marktplatz-APIs haben Wochen bis Monate
  Vorlaufzeit für die Produktivfreigabe).
- Rechtliche Ersteinschätzung zu Pflichtangaben und AGB-Konformität.

**Phase 1 — MVP (Kernschleife, 1 Plattform Ende-zu-Ende)**

- Foto-Upload + einfache KI-Kategorisierung/Textgenerierung
- Ein Marktplatz-Adapter komplett (Auth, Publish, Status)
- Review-UI, Basis-Dashboard
- Ziel: ein Produkt lässt sich vollständig fotografieren, KI-unterstützt
  beschreiben und auf einer Plattform veröffentlichen.

**Phase 2 — Multi-Plattform + Formatierungs-Hilfe**

- Zweite/dritte API-Plattform
- Copy-Paste-Assistent für API-lose Plattformen
- Cross-Sync bei Verkauf (manuell getriggert)

**Phase 3 — Skalierung & Komfort**

- Preisvorschlag, OCR, Mengenverwaltung
- Automatisierte Statussynchronisation wo API-seitig möglich
- Team-Funktionen, Analytics

Konkrete Zeit-/Personenaufwände lassen sich seriös erst nach Festlegung
von Team-Größe, gewählter KI-Anbieterlösung und den tatsächlichen
Freigabezeiten der Marktplatz-APIs schätzen — pauschale Wochen-/
Monatsangaben an dieser Stelle wären eine unbegründete Zahl und werden
deshalb bewusst nicht angegeben.

---

## 16. Risiken & offene Fragen

- **API-Zugangsrisiko**: einige Marktplätze könnten Neuanträge für
  Entwicklerzugänge ablehnen/verzögern, insbesondere wenn die App als
  "Cross-Listing-Tool" für Privatverkäufer positioniert ist (manche
  Plattformen sehen Multi-Homing-Tools kritisch, da sie Nutzer von der
  eigenen Plattform weglenken können).
- **KI-Fehleinschätzungen**: falsche Zustands-/Attributangaben können zu
  Käuferreklamationen und Verkäuferhaftung führen — Review-Pflicht ist
  Pflichtbestandteil, kein optionales Feature.
- **Kategorie-Mapping-Pflege**: Marktplatz-Taxonomien ändern sich, ohne
  laufende Pflege drohen fehlerhafte/abgelehnte Listings.
- **Abhängigkeit von Drittanbieter-KI-Diensten**: Preis-, Verfügbarkeits-
  und Qualitätsänderungen externer Modelle wirken sich direkt auf die
  App aus.
- **Rechtliches Restrisiko bei API-losen Plattformen**: selbst der
  "reine Formatierungs-Hilfe"-Ansatz ohne Auto-Publishing ist rechtlich
  unkritischer, aber jede spätere Automatisierung dort sollte erneut
  einzeln geprüft werden.
- **Offene Frage, die ich nicht beantworten kann**: der aktuelle exakte
  Stand der API-Verfügbarkeit, Gebühren und Freigabekriterien für jede
  einzelne genannte Plattform zum heutigen Zeitpunkt — das muss vor
  Projektstart direkt bei den Plattformen recherchiert werden, da sich
  das schnell ändert und ich dazu keine verlässliche aktuelle Quelle
  heranziehen kann.

---

## 17. Nächste Schritte

1. Zielmarktplätze priorisieren (Empfehlung: mit den 1–2 Plattformen mit
   offizieller, für den geplanten Nutzerkreis zugänglicher API starten).
2. Entwicklerzugänge bei diesen Plattformen beantragen (kann der
   zeitkritische Pfad sein — parallel zur technischen Konzeption starten).
3. Rechtliche Ersteinschätzung einholen (Pflichtangaben, AGB-Konformität,
   Verantwortlichkeitsregelung in den eigenen Nutzungsbedingungen).
4. KI-Anbieter für Bildanalyse/Textgenerierung evaluieren (Kosten pro
   Anfrage, Sprachqualität Deutsch, Datenschutz-/AVV-Fähigkeit).
5. Klickbaren Prototyp des Kernablaufs (Foto → Entwurf → Review →
   Publish auf einer Plattform) bauen, um die UX früh zu validieren,
   bevor in die volle Adapter-Architektur investiert wird.
