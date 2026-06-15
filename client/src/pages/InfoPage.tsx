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

type InfoKind = "projekt" | "impressum" | "kontakt";

const TITLES: Record<InfoKind, string> = {
  projekt: "Projektbeschreibung",
  impressum: "Impressum",
  kontakt: "Kontakt",
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
          <Placeholder c={c} lines={[
            "E-Mail:    — kontakt@… —",
            "",
            "Für Fragen, Anmerkungen oder Mitwirkung am wachsenden Werk.",
            "Kontaktformular / weitere Kanäle: — zu ergänzen —",
          ]} />
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
