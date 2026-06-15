/**
 * InfoPage — statische Info-/Rechtsseiten (Projektbeschreibung, Impressum,
 * Kontakt). Eigener position:fixed-Scroll-Container (App-Scroll-Modell, s.
 * SiteFooter) + Footer am Ende.
 *
 * Projektbeschreibung ist echter Inhalt; Impressum + Kontakt sind bewusst
 * PLATZHALTER (rechtlich relevante Angaben füllt der Betreiber selbst).
 */
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, SERIF_BODY, type Palette } from "@/lib/theme";
import SiteFooter from "@/components/SiteFooter";

type InfoKind = "projekt" | "impressum" | "kontakt" | "nutzung" | "lizenz";

const TITLES: Record<InfoKind, string> = {
  projekt: "Projektbeschreibung",
  impressum: "Impressum",
  kontakt: "Kontakt",
  nutzung: "Nutzungsbedingungen",
  lizenz: "Lizenz",
};

function Placeholder({ c, lines }: { c: Palette; lines: string[] }) {
  return (
    <div style={{
      border: `1px dashed ${c.border}`, borderRadius: 6, padding: "1rem 1.2rem",
      background: c.deep, color: c.muted, fontFamily: MONO, fontSize: "0.75rem", lineHeight: 1.8,
    }}>
      <div style={{ color: c.accentText, marginBottom: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.55rem" }}>
        ◇ Platzhalter — vom Betreiber auszufüllen
      </div>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

export default function InfoPage({ kind }: { kind: InfoKind }) {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;

  const para: React.CSSProperties = { fontFamily: SERIF_BODY, fontSize: "1rem", lineHeight: 1.7, color: c.textDim, marginBottom: "1rem" };
  const H2 = ({ children }: { children: React.ReactNode }) => (
    <h2 style={{ fontFamily: SERIF, fontSize: "1.1rem", color: c.textBright, margin: "1.6rem 0 0.6rem" }}>{children}</h2>
  );
  const note: React.CSSProperties = {
    border: `1px dashed ${c.border}`, borderRadius: 6, padding: "0.8rem 1rem", background: c.deep,
    color: c.muted, fontFamily: MONO, fontSize: "0.7rem", lineHeight: 1.7, marginBottom: "1.2rem",
  };
  const a: React.CSSProperties = { color: c.accentText };
  const REPO = "https://github.com/marksen23/digitale-transformation-ebook";

  return (
    <div
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", background: c.void, color: c.text,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: c.muted, marginBottom: "0.4rem" }}>
          Resonanzvernunft
        </div>
        <h1 style={{ margin: "0 0 1.5rem", fontFamily: SERIF, fontSize: "1.9rem", color: c.textBright, lineHeight: 1.2 }}>
          {TITLES[kind]}
        </h1>

        {kind === "projekt" && (
          <>
            <p style={para}>
              <strong style={{ color: c.text }}>Resonanzvernunft — Die Digitale Transformation</strong> ist
              ein lebendiges, sich selbst erweiterndes Philosophie-Werk: ein Buchtext, ein interaktives
              Begriffsnetz und ein wachsender Korpus von „Begegnungen" — KI- und menschlich erzeugte
              Resonanzen auf das Werk.
            </p>
            <p style={para}>
              Im Zentrum steht die <em>Resonanzvernunft</em> — eine Epistemologie, Ethik und Ontologie des
              Zwischen. Leserinnen und Leser können den Text lesen, das Begriffsnetz erkunden, Passagen
              weiterdenken und im Dialog mit dem Werk neue Erkenntnisse erzeugen. Was den Schutzwall aus
              Werkstreue, Begriffsnähe und menschlicher Kuratierung passiert, lagert sich an den Kanon an —
              das Werk wächst.
            </p>
            <p style={para}>
              Die <a href="/live" style={{ color: c.accentText }}>Live-Ansicht</a> zeigt stets das Neueste,
              der <a href="/blog" style={{ color: c.accentText }}>Blog</a> ordnet die Begegnungen nach
              Bereichen und führt sie in Masterdokumenten zusammen.
            </p>
          </>
        )}

        {kind === "impressum" && (
          <Placeholder c={c} lines={[
            "Angaben gemäß § 5 TMG / § 18 MStV:",
            "",
            "Name / Verantwortlich:  Markus Oehring",
            "Anschrift:              — Straße, PLZ Ort —",
            "E-Mail:                 — kontakt@… —",
            "",
            "Haftungs- und Urheberrechtshinweise: — zu ergänzen —",
          ]} />
        )}

        {kind === "kontakt" && (
          <>
            <p style={para}>
              Für Fragen, Anmerkungen, Hinweise auf Fehler oder die Mitwirkung am wachsenden Werk
              gibt es zwei Wege:
            </p>
            <H2>Per E-Mail</H2>
            <Placeholder c={c} lines={["E-Mail:  — kontakt@… —  (vom Betreiber einzutragen)"]} />
            <H2>Über GitHub</H2>
            <p style={para}>
              Öffentliche Diskussion, Fehlermeldungen und Vorschläge laufen am besten über die
              Issues des Projekts:{" "}
              <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" style={a}>
                github.com/marksen23/…/issues ↗
              </a>.
            </p>
            <p style={{ ...para, color: c.muted, fontSize: "0.9rem" }}>
              Hinweis: Über die Reader-Funktionen (Kapitel-Frage, Begriffsnetz-Dialog, Enkidu)
              erzeugte Eingaben können — ggf. anonymisiert — in den öffentlichen Korpus aufgenommen
              werden. Details in der <a href="/lizenz" style={a}>Lizenz</a> und den{" "}
              <a href="/nutzungsbedingungen" style={a}>Nutzungsbedingungen</a>.
            </p>
          </>
        )}

        {kind === "nutzung" && (
          <>
            <div style={note}>
              ◇ Entwurf / Vorlage — diese Bedingungen sind ein sachlicher Ausgangstext und ersetzen
              keine Rechtsberatung. Vor dem produktiven Einsatz bitte anwaltlich prüfen lassen.
            </div>
            <p style={para}>
              Diese Nutzungsbedingungen regeln die Nutzung der Web-Anwendung „Resonanzvernunft —
              Die Digitale Transformation" (nachfolgend „das Angebot"). Mit der Nutzung erklärst du
              dich mit ihnen einverstanden.
            </p>

            <H2>1. Gegenstand</H2>
            <p style={para}>
              Das Angebot stellt einen Buchtext, ein interaktives Begriffsnetz, eine semantische
              Korpus-Suche sowie KI-gestützte Funktionen (Kapitel-Frage, Übersetzung,
              Begriffsnetz-Analyse, Enkidu-Begegnung) bereit. Die Nutzung erfolgt zu privaten,
              nicht-kommerziellen Zwecken der Lektüre und individuellen Auseinandersetzung.
            </p>

            <H2>2. Nutzungsrechte am Werk</H2>
            <p style={para}>
              Sämtliche Inhalte sind urheberrechtlich geschützt. Umfang und Grenzen der erlaubten
              Nutzung — insbesondere das Zitatrecht und die Verbote von Vervielfältigung, Bearbeitung
              und maschinellem Training — ergeben sich aus der <a href="/lizenz" style={a}>Lizenz</a>,
              die Bestandteil dieser Bedingungen ist.
            </p>

            <H2>3. KI-gestützte Funktionen</H2>
            <p style={para}>
              Antworten der KI-Funktionen werden maschinell erzeugt. Sie können unvollständig,
              kontextabhängig oder fehlerhaft sein und stellen keine fachliche, rechtliche,
              medizinische oder sonstige Beratung dar. Das Werk ist ein philosophisch-literarisches
              Angebot; eine Gewähr für Richtigkeit oder Eignung für einen bestimmten Zweck wird nicht
              übernommen.
            </p>

            <H2>4. Nutzerbeiträge und Korpus</H2>
            <p style={para}>
              Über die Reader-Funktionen erzeugte Eingaben und die daraus entstehenden KI-Antworten
              können — gegebenenfalls anonymisiert und nach Kuratierung durch den Autor — in den
              öffentlichen Korpus (<code>content/resonanzen/</code>) aufgenommen werden. Mit der
              Nutzung räumst du das hierfür erforderliche, einfache Nutzungsrecht ein. Gib keine
              personenbezogenen oder vertraulichen Daten in die Eingabefelder ein.
            </p>

            <H2>5. Unzulässige Nutzung</H2>
            <p style={para}>
              Untersagt sind insbesondere das automatisierte Auslesen (Scraping), die Nutzung der
              Inhalte zum Training oder Fine-Tuning maschineller Lernmodelle außerhalb der
              bereitgestellten Funktionen, sowie jede Beeinträchtigung der Verfügbarkeit oder
              Integrität des Angebots.
            </p>

            <H2>6. Haftung</H2>
            <p style={para}>
              Das Angebot wird „wie besehen" und ohne Gewährleistung bereitgestellt. Eine Haftung für
              Schäden aus der Nutzung wird, soweit gesetzlich zulässig, ausgeschlossen; unberührt
              bleibt die Haftung für Vorsatz und grobe Fahrlässigkeit sowie nach zwingendem Recht.
            </p>

            <H2>7. Änderungen und anwendbares Recht</H2>
            <p style={para}>
              Diese Bedingungen können angepasst werden; maßgeblich ist die jeweils hier
              veröffentlichte Fassung. Es gilt deutsches Recht. Sollten einzelne Bestimmungen
              unwirksam sein, bleibt der übrige Text wirksam.
            </p>
          </>
        )}

        {kind === "lizenz" && (
          <>
            <p style={para}>
              <strong style={{ color: c.text }}>Copyright © 2026 Markus Oehring. Alle Rechte
              vorbehalten.</strong> Das Werk, der Quellcode der Reader-Anwendung und der Resonanz-Korpus
              stehen unter einer eigenen Copyright-Lizenz. Maßgeblich ist die vollständige{" "}
              <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" style={a}>
                LICENSE-Datei im Repository ↗
              </a>. Die folgende Übersicht fasst sie zusammen.
            </p>

            <H2>Erlaubt</H2>
            <ul style={{ ...para, paddingLeft: "1.2rem" }}>
              <li>Persönliche, private Nutzung zum Lesen, Hören und zur individuellen Auseinandersetzung.</li>
              <li>Kurze Zitate (bis 100 Wörter) für akademische, kritische oder journalistische Zwecke — mit Quellenangabe (Oehring, Markus, 2026: Die Digitale Transformation).</li>
              <li>Verlinkung, sowie Star-, Watch- und Issue-Funktionen auf GitHub und öffentliche Diskussion der Inhalte.</li>
            </ul>

            <H2>Nicht erlaubt (ohne schriftliche Genehmigung)</H2>
            <ul style={{ ...para, paddingLeft: "1.2rem" }}>
              <li>Vervielfältigung, Speicherung oder Weitergabe wesentlicher Teile des Werks.</li>
              <li>Veröffentlichung von Auszügen über das Zitatrecht hinaus.</li>
              <li>Bearbeitung, Übersetzung oder abgeleitete Werke (Re-Mixing, Adaption, Fortsetzung).</li>
              <li>Jede kommerzielle Nutzung.</li>
              <li>Nutzung zum Training/Fine-Tuning von KI-Modellen oder zur automatisierten Inhaltsverarbeitung — ausgenommen die in der Reader-Anwendung integrierten Funktionen.</li>
            </ul>

            <H2>Korpus &amp; History</H2>
            <p style={para}>
              Die KI-Antworten in <code>content/resonanzen/</code> und ihre Kuratierung sind Teil des
              geschützten Werks. Forken und Klonen sind technische GitHub-Funktionen; jede so erzeugte
              Kopie unterliegt vollumfänglich dieser Lizenz.
            </p>
          </>
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
