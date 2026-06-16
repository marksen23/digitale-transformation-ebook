/**
 * ProjektPage (/projekt) — die animierte „Mechanik"-Seite: erklärt, wie aus
 * einem Buch ein wachsendes, sich selbst prüfendes Denkfeld wird, und wohin es
 * zielt. Scrollytelling mit eigenen, theme-bewussten SVG-Illustrationen
 * (passend zum SVG-Charakter des Werks) statt Stockfotos.
 *
 * Inhalte sind aus der realen Funktion des Projekts hergeleitet: wachsender
 * Korpus, triangulierter Schutzwall / Drift-Detection, Selbstlern-Kreis,
 * wachsendes Begriffsnetz, Pipeline, Masterdokumente — plus die wissenschaftliche
 * Ambition (Feld-/Quantenmetaphorik, Transformation berechenbarer machen).
 * Letztere ist bewusst als Aspiration markiert, nicht als belegtes Resultat.
 *
 * Animationen respektieren prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, SERIF_BODY, type Palette } from "@/lib/theme";
import SiteFooter from "@/components/SiteFooter";

/* ── Reveal-on-scroll (IntersectionObserver gegen den Viewport — der
      fixe Scroll-Container füllt ihn, also greift root:null). ── */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? "none" : "translateY(26px)",
      transition: "opacity 0.7s ease, transform 0.7s ease",
      transitionDelay: `${delay}ms`,
    }}>{children}</div>
  );
}

interface SvgProps { c: Palette }

/* ── 1. Resonanz: zwei Quellen, deren Wellen sich im „Zwischen" treffen ── */
function WaveSvg({ c }: SvgProps) {
  const ring = (cx: number, d: number) => (
    [0, 1, 2].map(i => (
      <circle key={i} className="pjk-ring" cx={cx} cy={90} r={9} fill="none"
              stroke={c.accent} strokeWidth={1.2}
              style={{ animationDelay: `${d + i * 1}s` }} />
    ))
  );
  return (
    <svg viewBox="0 0 560 180" width="100%" role="img" aria-label="Zwei Resonanzquellen treffen sich im Zwischen">
      {ring(120, 0)}
      {ring(440, 0.5)}
      <circle cx={120} cy={90} r={6} fill={c.accent} />
      <circle cx={440} cy={90} r={6} fill={c.accent} />
      <circle className="pjk-core" cx={280} cy={90} r={14} fill="none" stroke={c.accentText} strokeWidth={1.6} />
      <circle cx={280} cy={90} r={4} fill={c.accentText} />
      <text x={120} y={140} textAnchor="middle" fill={c.muted} fontFamily={MONO} fontSize={11}>Leser</text>
      <text x={440} y={140} textAnchor="middle" fill={c.muted} fontFamily={MONO} fontSize={11}>Werk</text>
      <text x={280} y={140} textAnchor="middle" fill={c.accentText} fontFamily={MONO} fontSize={11}>das Zwischen</text>
    </svg>
  );
}

/* ── 2. Der Kreislauf: Stationen im Kreis, ein Punkt umrundet sie ── */
function LoopSvg({ c }: SvgProps) {
  const stations = ["Frage", "KI-Antwort", "Schutzwall", "Korpus", "RAG-Kontext"];
  const R = 70, cx = 140, cy = 110;
  return (
    <svg viewBox="0 0 280 220" width="100%" role="img" aria-label="Selbstlern-Kreislauf">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={c.border} strokeWidth={1} strokeDasharray="3 5" />
      <g className="pjk-orbit" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx + R} cy={cy} r={5} fill={c.accentText} />
      </g>
      {stations.map((s, i) => {
        const a = (i / stations.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        return (
          <g key={s}>
            <circle cx={x} cy={y} r={4} fill={c.accent} />
            <text x={x} y={y - 9} textAnchor="middle" fill={c.textDim} fontFamily={MONO} fontSize={9}>{s}</text>
          </g>
        );
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" fill={c.muted} fontFamily={MONO} fontSize={9}>Kreislauf</text>
    </svg>
  );
}

/* ── 3. Schutzwall: drei Anker als Dreieck, ein Eintrag muss hindurch ── */
function WallSvg({ c }: SvgProps) {
  const A = [180, 30], B = [40, 200], Cc = [320, 200];
  return (
    <svg viewBox="0 0 360 240" width="100%" role="img" aria-label="Triangulierter Schutzwall">
      <polygon points={`${A[0]},${A[1]} ${B[0]},${B[1]} ${Cc[0]},${Cc[1]}`}
               fill="none" stroke={c.accent} strokeWidth={1.4} className="pjk-tri" />
      {[[A, "Werk-Prosa"], [B, "Begriffsstruktur"], [Cc, "kuratierter Korpus"]].map(([p, l], i) => (
        <g key={i}>
          <circle cx={(p as number[])[0]} cy={(p as number[])[1]} r={5} fill={c.accentText} />
          <text x={(p as number[])[0]} y={(p as number[])[1] + (i === 0 ? -12 : 18)} textAnchor="middle"
                fill={c.textDim} fontFamily={MONO} fontSize={9}>{l as string}</text>
        </g>
      ))}
      <circle className="pjk-pass" cx={180} cy={150} r={4} fill={c.accent} />
      <text x={180} y={130} textAnchor="middle" fill={c.muted} fontFamily={MONO} fontSize={9}>Eintrag</text>
    </svg>
  );
}

/* ── 4. Wachsendes Netz: Knoten poppen, eine werdende Kante verfestigt sich ── */
function NetSvg({ c }: SvgProps) {
  const nodes = [[60, 60], [150, 40], [240, 80], [110, 130], [210, 150], [300, 120]];
  const edges = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 5]];
  return (
    <svg viewBox="0 0 360 190" width="100%" role="img" aria-label="Wachsendes Begriffsnetz">
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
              stroke={c.border} strokeWidth={1} />
      ))}
      {/* werdende Kante */}
      <line className="pjk-edge" x1={nodes[4][0]} y1={nodes[4][1]} x2={nodes[5][0]} y2={nodes[5][1]}
            stroke={c.accentText} strokeWidth={1.5} strokeDasharray="4 4" />
      {nodes.map(([x, y], i) => (
        <circle key={i} className="pjk-node" cx={x} cy={y} r={i === 5 ? 8 : 6}
                fill={i === 5 ? c.accent : c.surface} stroke={c.accent} strokeWidth={1.4}
                style={{ animationDelay: `${i * 0.25}s`, transformBox: "fill-box", transformOrigin: "center" }} />
      ))}
      <text x={300} y={148} textAnchor="middle" fill={c.accentText} fontFamily={MONO} fontSize={9}>neu</text>
    </svg>
  );
}

/* ── 5. Pipeline: ein Paket wandert durch die Stationen ── */
function PipelineSvg({ c }: SvgProps) {
  const stages = ["Begegnung", "Markdown", "Index", "CI-Rebuild", "Live"];
  const w = 540, n = stages.length;
  return (
    <svg viewBox={`0 0 ${w} 150`} width="100%" role="img" aria-label="Daten-Pipeline">
      <line x1={40} y1={60} x2={w - 40} y2={60} stroke={c.border} strokeWidth={1} />
      {stages.map((s, i) => {
        const cx = 40 + (i + 0.5) * ((w - 80) / n);
        return (
          <g key={s}>
            <rect x={cx - 36} y={44} width={72} height={32} rx={4} fill={c.surface} stroke={c.border} strokeWidth={1} />
            <text x={cx} y={64} textAnchor="middle" fill={c.textDim} fontFamily={MONO} fontSize={9}>{s}</text>
            {i === 3 && (
              <text x={cx} y={96} textAnchor="middle" fill={c.muted} fontFamily={MONO} fontSize={7.5}>
                Embeddings · Cross-Links · Drift
              </text>
            )}
          </g>
        );
      })}
      <circle className="pjk-packet" cy={60} r={5} fill={c.accentText} />
    </svg>
  );
}

/* ── 6. Masterdokument: viele Varianten verdichten zu einer Synthese ── */
function MasterSvg({ c }: SvgProps) {
  return (
    <svg viewBox="0 0 360 160" width="100%" role="img" aria-label="Masterdokument-Synthese">
      {[[40, 30], [40, 70], [40, 110]].map(([x, y], i) => (
        <g key={i} className="pjk-merge" style={{ animationDelay: `${i * 0.3}s` }}>
          <rect x={x} y={y} width={56} height={28} rx={3} fill={c.surface} stroke={c.border} strokeWidth={1} />
          <line x1={x + 8} y1={y + 11} x2={x + 48} y2={y + 11} stroke={c.muted} strokeWidth={1} />
          <line x1={x + 8} y1={y + 18} x2={x + 38} y2={y + 18} stroke={c.muted} strokeWidth={1} />
        </g>
      ))}
      <path d="M110 70 L 210 80" stroke={c.border} strokeWidth={1} fill="none" />
      <rect x={230} y={48} width={90} height={64} rx={5} fill={c.deep} stroke={c.accent} strokeWidth={1.4} />
      <text x={275} y={44} textAnchor="middle" fill={c.accentText} fontFamily={MONO} fontSize={9}>Masterdokument</text>
      {[66, 76, 86, 96].map((y, i) => (
        <line key={i} x1={244} y1={y} x2={i % 2 ? 300 : 308} y2={y} stroke={c.textDim} strokeWidth={1} />
      ))}
    </svg>
  );
}

/* ── 7. Feld: Anregungen in einem Feld + Ordnungsparameter-Kurve ── */
function FieldSvg({ c }: SvgProps) {
  const dots: [number, number][] = [];
  for (let x = 0; x < 7; x++) for (let y = 0; y < 4; y++) dots.push([40 + x * 40, 40 + y * 32]);
  return (
    <svg viewBox="0 0 560 220" width="100%" role="img" aria-label="Bedeutung als Feld mit Ordnungsparameter">
      {dots.map(([x, y], i) => (
        <circle key={i} className="pjk-field" cx={x} cy={y} r={3.2} fill={c.accent}
                style={{ animationDelay: `${((x + y) % 7) * 0.18}s` }} />
      ))}
      <text x={170} y={185} textAnchor="middle" fill={c.muted} fontFamily={MONO} fontSize={9}>Feld der Bedeutung — Resonanzen als Anregungen</text>
      {/* Phasenübergang / Ordnungsparameter */}
      <path d="M360 180 C 430 180, 450 60, 520 55" fill="none" stroke={c.accentText} strokeWidth={1.6}
            strokeDasharray="320" className="pjk-curve" />
      <line x1={360} y1={40} x2={360} y2={185} stroke={c.border} strokeWidth={1} />
      <line x1={360} y1={185} x2={535} y2={185} stroke={c.border} strokeWidth={1} />
      <text x={448} y={205} textAnchor="middle" fill={c.muted} fontFamily={MONO} fontSize={8.5}>eff. Temperatur →</text>
      <text x={352} y={48} textAnchor="end" fill={c.muted} fontFamily={MONO} fontSize={8.5}>Ordnung</text>
    </svg>
  );
}

function Section({ c, kicker, title, svg, children }: {
  c: Palette; kicker: string; title: string; svg: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Reveal>
      <section style={{ margin: "0 0 3.5rem" }}>
        <div style={{
          background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
          padding: "1.4rem 1.4rem 1rem", marginBottom: "1rem",
        }}>
          {svg}
        </div>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: c.accentText, marginBottom: "0.3rem" }}>
          {kicker}
        </div>
        <h2 style={{ margin: "0 0 0.6rem", fontFamily: SERIF, fontSize: "1.4rem", color: c.textBright, lineHeight: 1.2 }}>{title}</h2>
        <div style={{ fontFamily: SERIF_BODY, fontSize: "1rem", lineHeight: 1.7, color: c.textDim }}>{children}</div>
      </section>
    </Reveal>
  );
}

export default function ProjektPage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const strong: React.CSSProperties = { color: c.text };
  const acc: React.CSSProperties = { color: c.accentText };

  return (
    <div
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", background: c.void, color: c.text,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <style>{`
        @keyframes pjk-pulse { 0% { transform: scale(0.4); opacity: 0.7 } 100% { transform: scale(7); opacity: 0 } }
        @keyframes pjk-corepulse { 0%,100% { opacity: 0.4; transform: scale(0.85) } 50% { opacity: 1; transform: scale(1.15) } }
        @keyframes pjk-orbit { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes pjk-pass { 0% { transform: translateY(-26px); opacity: 0 } 30% { opacity: 1 } 70% { opacity: 1 } 100% { transform: translateY(60px); opacity: 0 } }
        @keyframes pjk-tri { 0%,100% { opacity: 0.55 } 50% { opacity: 1 } }
        @keyframes pjk-node { 0% { transform: scale(0); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
        @keyframes pjk-edge { 0% { stroke-dashoffset: 60; opacity: 0.3 } 100% { stroke-dashoffset: 0; opacity: 1 } }
        @keyframes pjk-packet { 0% { transform: translateX(70px); opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { transform: translateX(500px); opacity: 0 } }
        @keyframes pjk-merge { 0% { transform: translateX(0); opacity: 0.5 } 50% { transform: translateX(20px); opacity: 1 } 100% { transform: translateX(0); opacity: 0.5 } }
        @keyframes pjk-field { 0%,100% { opacity: 0.25; transform: scale(0.8) } 50% { opacity: 1; transform: scale(1.4) } }
        @keyframes pjk-curve { from { stroke-dashoffset: 320 } to { stroke-dashoffset: 0 } }
        .pjk-ring { transform-box: fill-box; transform-origin: center; animation: pjk-pulse 3.4s ease-out infinite; }
        .pjk-core { transform-box: fill-box; transform-origin: center; animation: pjk-corepulse 2.4s ease-in-out infinite; }
        .pjk-orbit { animation: pjk-orbit 7s linear infinite; }
        .pjk-pass { animation: pjk-pass 3s ease-in-out infinite; }
        .pjk-tri  { animation: pjk-tri 3s ease-in-out infinite; }
        .pjk-node { animation: pjk-node 0.6s ease-out both; }
        .pjk-edge { animation: pjk-edge 2.2s ease-in-out infinite alternate; }
        .pjk-packet { animation: pjk-packet 4s ease-in-out infinite; }
        .pjk-field { transform-box: fill-box; transform-origin: center; animation: pjk-field 3.6s ease-in-out infinite; }
        .pjk-merge { transform-box: fill-box; transform-origin: center; animation: pjk-merge 3.4s ease-in-out infinite; }
        .pjk-curve { stroke-dasharray: 320; animation: pjk-curve 2.6s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .pjk-ring,.pjk-core,.pjk-orbit,.pjk-pass,.pjk-tri,.pjk-node,.pjk-edge,.pjk-packet,.pjk-field,.pjk-merge,.pjk-curve { animation: none !important; }
          .pjk-curve { stroke-dashoffset: 0 !important; }
          .pjk-node { opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2.5rem 1.5rem 0" }}>
        {/* Hero */}
        <Reveal>
          <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", color: c.muted, marginBottom: "0.5rem" }}>
            Resonanzvernunft · Die Mechanik
          </div>
          <h1 style={{ margin: "0 0 0.8rem", fontFamily: SERIF, fontSize: "2.3rem", color: c.textBright, lineHeight: 1.15 }}>
            Wie ein Buch zu einem<br />denkenden Feld wird
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "1.1rem", color: c.textDim, lineHeight: 1.6, marginTop: 0 }}>
            Ein lebendiges Werk, das mit jeder Begegnung wächst, sich selbst prüft — und danach
            strebt, Transformation ein Stück weit berechenbar zu machen.
          </p>
          <div style={{ margin: "1.5rem 0 0" }}><WaveSvg c={c} /></div>
        </Reveal>

        <div style={{ height: "2.5rem" }} />

        <Section c={c} kicker="Die Idee" title="Erkenntnis im Zwischen" svg={<WaveSvg c={c} />}>
          <p><strong style={strong}>Resonanzvernunft</strong> ist kein abgeschlossenes Buch, sondern ein
          lebendiges Werk: ein poetisch-philosophischer Text, ein interaktives Begriffsnetz und ein
          wachsender Korpus von <em>Begegnungen</em> — Resonanzen zwischen Leser, Werk und Maschine.</p>
          <p>Im Zentrum steht das <span style={acc}>Zwischen</span>: Erkenntnis entsteht weder rein im
          Subjekt noch im Objekt, sondern in ihrer Resonanz. Eine Epistemologie, Ethik und Ontologie
          des Relationalen — und der Versuch, sie nicht nur zu behaupten, sondern <em>vorzuführen</em>.</p>
        </Section>

        <Section c={c} kicker="Der Kreislauf" title="Ein Werk, das aus Begegnungen lernt" svg={<LoopSvg c={c} />}>
          <p>Jede Begegnung speist das Werk. Ein Leser stellt eine Frage, die KI antwortet im Geist des
          Werks, die Antwort wird eingebettet, geprüft und — wenn sie trägt — kuratiert.</p>
          <p><strong style={strong}>Nur kuratierte Erkenntnisse</strong> fließen als Kontext in künftige
          Antworten zurück. So schließt sich ein Kreis, der das Werk reicher macht, ohne es zu
          verwässern — Schutz vor dem Echo der eigenen Stimme.</p>
        </Section>

        <Section c={c} kicker="Der Schutzwall" title="Wachstum ohne Drift" svg={<WallSvg c={c} />}>
          <p>Damit das Werk sich selbst treu bleibt, muss jede neue Erkenntnis einen <strong style={strong}>dreifachen
          Schutzwall</strong> passieren: Nähe zur <span style={acc}>Werk-Prosa</span>, Verankerung in der
          <span style={acc}> Begriffsstruktur</span> des Netzes und Stimmigkeit zum bereits
          <span style={acc}> kuratierten Korpus</span> — drei unabhängige Anker.</p>
          <p>Dazu kommen Echo-Erkennung (Wiederholungen) und Novelty-Prüfung (thematische Ausreißer).
          Was nicht trägt, bleibt „roh" und wird nie zurückgefüttert — eine bewusste Schranke gegen
          den schleichenden <em>Model-Collapse</em>.</p>
        </Section>

        <Section c={c} kicker="Das wachsende Netz" title="Anlagerung statt Überschreiben" svg={<NetSvg c={c} />}>
          <p>Das Begriffsnetz wächst durch <strong style={strong}>Anlagerung</strong>, nie durch
          Überschreiben. Der handgesetzte Kern bleibt; neue Begriffe und <span style={acc}>werdende
          Verbindungen</span> lagern sich an, wenn der Korpus sie trägt und sie distinkt genug sind.</p>
          <p>Entdeckung, bevor sie Kanon wird: Verbindungen tauchen erst als gestrichelte Ahnung auf
          und werden erst nach menschlicher Prüfung in den Kanon erhoben.</p>
        </Section>

        <Section c={c} kicker="Die Mechanik" title="Live anhängen, vollständig nachrechnen" svg={<PipelineSvg c={c} />}>
          <p>Unter der Oberfläche: Jede Begegnung wird als Markdown nach GitHub geschrieben und sofort
          in den Live-Index eingehängt. Eine CI-Pipeline berechnet dann die teuren abgeleiteten Felder —
          <strong style={strong}> 3072-dimensionale Embeddings</strong>, Querbezüge, Drift-Scores, eine
          UMAP-Landkarte.</p>
          <p>Der Server liest den Korpus <span style={acc}>live</span>, ganz ohne Redeploy: Der
          Selbstlern-Kreis schließt sich deploy-frei. Frische Begegnungen sind sofort sichtbar — ihre
          Einordnung holt der nächste Rebuild nach.</p>
        </Section>

        <Section c={c} kicker="Verdichtung" title="Masterdokumente gegen die Dopplung" svg={<MasterSvg c={c} />}>
          <p>Wo viele Begegnungen dasselbe umkreisen, fasst ein <strong style={strong}>Masterdokument</strong>
          sie zu einer geordneten, dopplungsfreien Synthese zusammen — Wissen, das sich verdichtet,
          statt sich zu wiederholen. Der Blog ordnet sie nach Bereichen.</p>
        </Section>

        <Section c={c} kicker="Die Ambition" title="Transformation berechenbar machen" svg={<FieldSvg c={c} />}>
          <p>Die größere Frage, die das Werk umtreibt: <strong style={strong}>Was wäre, wenn sich
          Transformation berechnen ließe?</strong></p>
          <p>Das Werk behandelt Bedeutung als <span style={acc}>Feld</span> — Resonanzen sind Anregungen
          darin, der Korpus ein messbarer Zustand mit Ordnungsparametern. Im Vokabular der statistischen
          Physik und Feldtheorie gedacht: Begriffe koppeln (ein <em>J</em>), das Werk wirkt als äußeres
          Feld (ein <em>h</em>), und wie kohärent das Denkfeld ist, verhält sich wie eine
          <span style={acc}> effektive Temperatur</span>. Niedrige „Temperatur" heißt geordnete,
          getragene Erkenntnis; hohe heißt Drift. Selbst <em>Phasenübergänge</em> — das plötzliche
          Umschlagen eines Verständnisses — werden so beschreibbar.</p>
          <p>Die Hoffnung ist nicht, den Geist auf Physik zu reduzieren, sondern <strong style={strong}>Effekte
          verstehbar</strong> und Transformation ein Stück weit vorhersagbar zu machen — eine Brücke
          zwischen Resonanz und Berechenbarkeit, zwischen Quantenfeld und Begriffsnetz. Eine
          Forschungsrichtung, kein fertiger Beweis: das Werk instrumentiert sich selbst, um sie
          überhaupt prüfbar zu machen.</p>
        </Section>

        {/* CTA */}
        <Reveal>
          <div style={{
            background: c.deep, border: `1px solid ${c.border}`, borderRadius: 10,
            padding: "1.4rem 1.5rem", marginBottom: "1rem",
          }}>
            <div style={{ fontFamily: SERIF, fontSize: "1.15rem", color: c.textBright, marginBottom: "0.8rem" }}>
              Sieh die Mechanik in Bewegung
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
              {[
                { l: "Werk lesen", h: "/werk" },
                { l: "Begriffsnetz", h: "/begriffsnetz" },
                { l: "Live-Strom", h: "/live" },
                { l: "Blog", h: "/blog" },
                { l: "Statistik", h: "/statistik" },
              ].map(x => (
                <Link key={x.h} href={x.h} style={{
                  fontFamily: MONO, fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: c.accentText, textDecoration: "none",
                  border: `1px solid ${c.border}`, borderRadius: 6, padding: "0.65rem 0.9rem",
                  minHeight: 44, display: "inline-flex", alignItems: "center",
                }}>{x.l} →</Link>
              ))}
            </div>
          </div>
        </Reveal>

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
