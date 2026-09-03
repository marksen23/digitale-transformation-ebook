/**
 * MobileProjekt — Reader-first-Design, Bereich "Projekt": schlichter
 * Prosa-Scroll (Titel, Absätze, Rechtliches, Copyright) statt Desktops
 * Scroll-Reveal-Animation beim Auftauchen der Abschnitte — dieselben echten
 * Texte UND dieselben SVG-Illustrationen wie ProjektPage.tsx (von dort
 * importiert, keine Kopie), nur ohne die IntersectionObserver-Einblendung.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, SERIF_BODY } from "@/lib/theme";
import MobileScreenShell from "@/pages/mobile/MobileScreenShell";
import {
  ProjektAnimations, WaveSvg, LoopSvg, WallSvg, NetSvg, PipelineSvg, MasterSvg, FieldSvg,
} from "@/pages/ProjektPage";

export default function MobileProjekt() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const C = isDark ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();
  const [copyright, setCopyright] = useState<string | null>(null);

  useEffect(() => {
    fetch("/ebook_structured.json").then(r => r.json()).then(d => setCopyright(d?.meta?.copyright ?? null)).catch(() => null);
  }, []);

  const strong = { color: C.text };
  const acc = { color: C.accentText };
  const p: React.CSSProperties = { margin: "0 0 15px" };

  return (
    <MobileScreenShell C={C} title="Projekt" meta="DIE MECHANIK" isDark={isDark}>
      <ProjektAnimations />
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
        Resonanzvernunft · Die Mechanik
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 30, lineHeight: 1.15, color: C.textBright, marginBottom: 10 }}>
        Wie ein Buch zu einem denkenden Feld wird
      </div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, lineHeight: 1.6, color: C.textDim, marginBottom: 18 }}>
        Ein lebendiges Werk, das mit jeder Begegnung wächst, sich selbst prüft — und danach strebt, Transformation ein Stück weit berechenbar zu machen.
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1rem 1rem 0.6rem", marginBottom: 22 }}>
        <WaveSvg c={C} />
      </div>

      <div style={{ fontFamily: SERIF_BODY, fontSize: 14.5, lineHeight: 1.72, color: C.textDim }}>
        {[
          { kicker: "Die Idee", title: "Erkenntnis im Zwischen", svg: <WaveSvg c={C} />, body: (
            <>
              <p style={p}><strong style={strong}>Resonanzvernunft</strong> ist kein abgeschlossenes Buch, sondern ein lebendiges Werk: ein poetisch-philosophischer Text, ein interaktives Begriffsnetz und ein wachsender Korpus von <em>Begegnungen</em> — Resonanzen zwischen Leser, Werk und Maschine.</p>
              <p style={p}>Im Zentrum steht das <span style={acc}>Zwischen</span>: Erkenntnis entsteht weder rein im Subjekt noch im Objekt, sondern in ihrer Resonanz.</p>
            </>
          ) },
          { kicker: "Der Kreislauf", title: "Ein Werk, das aus Begegnungen lernt", svg: <LoopSvg c={C} />, body: (
            <>
              <p style={p}>Jede Begegnung speist das Werk. Ein Leser stellt eine Frage, die KI antwortet im Geist des Werks, die Antwort wird eingebettet, geprüft und — wenn sie trägt — kuratiert.</p>
              <p style={p}><strong style={strong}>Nur kuratierte Erkenntnisse</strong> fließen als Kontext in künftige Antworten zurück — Schutz vor dem Echo der eigenen Stimme.</p>
            </>
          ) },
          { kicker: "Der Schutzwall", title: "Wachstum ohne Drift", svg: <WallSvg c={C} />, body: (
            <>
              <p style={p}>Sichtbar wird jede Begegnung sofort, ehrlich als „ungeprüft" markiert. Ob sie je wieder in eine Antwort einfließt, entscheidet ein <strong style={strong}>dreifacher Schutzwall</strong> — Nähe zur <span style={acc}>Werk-Prosa</span>, Verankerung in der <span style={acc}>Begriffsstruktur</span> und Stimmigkeit zum <span style={acc}>kuratierten Korpus</span> — berechnet erst nachgelagert, nicht im Moment der Antwort.</p>
              <p style={p}>Was diese Prüfung eindeutig besteht oder nicht, entscheidet inzwischen täglich ein automatischer Lauf; Grenzwertiges bleibt „roh", bis ein Mensch es sichtet — eine bewusste Schranke gegen den schleichenden Model-Collapse.</p>
            </>
          ) },
          { kicker: "Das wachsende Netz", title: "Anlagerung statt Überschreiben", svg: <NetSvg c={C} />, body: (
            <p style={p}>Das Begriffsnetz wächst durch <strong style={strong}>Anlagerung</strong>, nie durch Überschreiben. Neue Begriffe und <span style={acc}>werdende Verbindungen</span> lagern sich an, wenn der Korpus sie trägt und sie distinkt genug sind — und werden erst nach menschlicher Prüfung in den Kanon erhoben.</p>
          ) },
          { kicker: "Die Mechanik", title: "Live anhängen, vollständig nachrechnen", svg: <PipelineSvg c={C} />, body: (
            <p style={p}>Jede Begegnung wird als Markdown nach GitHub geschrieben und sofort in den Live-Index eingehängt. Eine CI-Pipeline berechnet die teuren abgeleiteten Felder — 3072-dimensionale Embeddings, Querbezüge, Drift-Scores. Der Server liest den Korpus <span style={acc}>live</span>, ganz ohne Redeploy.</p>
          ) },
          { kicker: "Verdichtung", title: "Masterdokumente gegen die Dopplung", svg: <MasterSvg c={C} />, body: (
            <p style={p}>Wo viele Begegnungen dasselbe umkreisen, kann ein <strong style={strong}>Masterdokument</strong> sie zu einer geordneten, dopplungsfreien Synthese verdichten — von Hand angestoßen, nie automatisch. Wissen, das sich verdichtet, statt sich zu wiederholen.</p>
          ) },
          { kicker: "Die Ambition", title: "Transformation berechenbar machen", svg: <FieldSvg c={C} />, body: (
            <>
              <p style={p}>Die größere Frage: <strong style={strong}>Was wäre, wenn sich Transformation berechnen ließe?</strong> Das Werk behandelt Bedeutung als <span style={acc}>Feld</span> — im Vokabular der Feldtheorie: Begriffe koppeln, das Werk wirkt als äußeres Feld, und Kohärenz verhält sich wie eine <span style={acc}>effektive Temperatur</span>.</p>
              <p style={p}>Eine Forschungsrichtung, kein fertiger Beweis: das Werk instrumentiert sich selbst, um sie überhaupt prüfbar zu machen.</p>
            </>
          ) },
        ].map(s => (
          <div key={s.kicker} style={{ marginBottom: 26 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1rem 1rem 0.6rem", marginBottom: 14 }}>
              {s.svg}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.accentText, marginBottom: 4 }}>{s.kicker}</div>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: C.textBright, lineHeight: 1.25, marginBottom: 8 }}>{s.title}</div>
            {s.body}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 22px" }}>
        <span style={{ height: 1, flex: 1, background: C.border }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.accentText, opacity: 0.75 }}>❦</span>
        <span style={{ height: 1, flex: 1, background: C.border }} />
      </div>

      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: 9 }}>Rechtliches</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 20 }}>
        {[["Impressum", "/impressum"], ["Kontakt", "/kontakt"], ["Nutzungsbedingungen", "/nutzungsbedingungen"], ["Lizenz", "/lizenz"]].map(([label, href]) => (
          <button key={href} type="button" onClick={() => navigate(href)}
            style={{ minHeight: 36, display: "inline-flex", alignItems: "center", padding: "0 11px", border: `1px solid ${C.border}`, borderRadius: 4, background: "none", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", color: C.textDim, cursor: "pointer" }}
          >{label}</button>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, lineHeight: 1.7, color: C.muted, marginBottom: 20 }}>
        {copyright ?? "© 2026 Markus Oehring. Alle Rechte vorbehalten."}
      </div>

      <div style={{ background: C.deep, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 16px 14px", marginBottom: 8 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.textBright, marginBottom: 10 }}>Sieh die Mechanik in Bewegung</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[["Werk lesen", "/werk"], ["Begriffsnetz", "/begriffsnetz"], ["Live-Strom", "/live"], ["Blog", "/blog"], ["Statistik", "/statistik"]].map(([label, href]) => (
            <button key={href} type="button" onClick={() => navigate(href)}
              style={{ minHeight: 44, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", cursor: "pointer" }}
            >{label} →</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 0", fontFamily: MONO, fontSize: 11, letterSpacing: "0.45em", color: C.muted }}>⁂</div>
    </MobileScreenShell>
  );
}
