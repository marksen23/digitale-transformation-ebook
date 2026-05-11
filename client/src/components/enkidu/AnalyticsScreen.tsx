import { useMemo } from "react";
import WordCloud from "./WordCloud";
import ResonanzChart from "./ResonanzChart";
import ThemenBalance from "./ThemenBalance";
import {
  extractKeywords,
  buildResonanzpfad,
  buildThemenBalance,
  type Conversation,
} from "@/lib/extractKeywords";
import { useEbookTheme } from "@/hooks/useEbookTheme";

interface AnalyticsScreenProps {
  conversations: Conversation[];
}

const C_DARK = {
  void: "#080808",
  surface: "#161616",
  border: "#2a2a2a",
  muted: "#444",
  textDim: "#888",
  text: "#c8c2b4",
  textBright: "#e8e2d4",
  accent: "#f59e0b",
  accentDim: "#b45309",
  serif: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'Courier Prime', 'Courier New', monospace",
} as const;

type CPalette = { readonly [K in keyof typeof C_DARK]: string };

const C_LIGHT: CPalette = {
  void: "#fafaf9",
  surface: "#ffffff",
  border: "#d8d2c8",
  muted: "#a8a29e",
  textDim: "#78716c",
  text: "#3a3530",
  textBright: "#1c1917",
  accent: "#f59e0b",
  accentDim: "#b45309",
  serif: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'Courier Prime', 'Courier New', monospace",
};

function Section({ c, title, children }: { c: CPalette; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${c.border}`,
      padding: "1.5rem",
    }}>
      <h3 style={{
        fontFamily: c.mono, fontSize: "0.65rem", letterSpacing: "0.18em",
        color: c.accentDim, textTransform: "uppercase",
        marginBottom: "1.25rem", paddingBottom: "0.75rem",
        borderBottom: `1px solid ${c.border}`,
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function AnalyticsScreen({ conversations }: AnalyticsScreenProps) {
  const isDark = useEbookTheme();
  const C: CPalette = isDark ? C_DARK : C_LIGHT;
  const keywords  = useMemo(() => extractKeywords(conversations, 55), [conversations]);
  const resonanz  = useMemo(() => buildResonanzpfad(conversations), [conversations]);
  const themen    = useMemo(() => buildThemenBalance(conversations), [conversations]);

  // Aggregate stats
  const total        = conversations.length;
  const withFeedback = conversations.filter(c => c.feedback?.q1 || c.feedback?.q2 || c.feedback?.q3).length;
  const resonanceHigh = resonanz.filter(p => p.avg >= 0.67).length;
  const totalMessages = conversations.reduce((sum, c) => sum + c.messages.filter(m => m.role === "user").length, 0);

  return (
    <div className="enkidu-analytics" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontFamily: C.serif, fontSize: "2.5rem", fontWeight: 400, fontStyle: "italic", color: C.textBright, marginBottom: "0.5rem" }}>
          Gesprächsanalyse
        </h2>
        <p style={{ fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.2em", color: C.muted, textTransform: "uppercase" }}>
          Muster aus deinen Begegnungen
        </p>
      </div>

      {/* Stats row */}
      <div className="enkidu-analytics-stats" style={{ display: "grid", marginBottom: "2rem" }}>
        {[
          { label: "Gespräche gesamt",      value: total        || "—" },
          { label: "Nachrichten verfasst",  value: totalMessages || "—" },
          { label: "Mit Nachklang",         value: withFeedback  || "—" },
          { label: "Hohe Resonanz",         value: resonanceHigh || "—" },
        ].map(card => (
          <div key={card.label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1.2rem 1.5rem" }}>
            <div style={{ fontFamily: C.serif, fontSize: "2rem", fontWeight: 400, color: C.accent, marginBottom: "0.3rem" }}>
              {card.value}
            </div>
            <div style={{ fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase", lineHeight: 1.4 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="enkidu-analytics-grid">
        {/* Word Cloud — full width */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Section c={C} title="Wort-Wolke — häufigste Begriffe">
            <WordCloud keywords={keywords} width={780} height={300} />
          </Section>
        </div>

        {/* Resonance chart */}
        <Section c={C} title="Resonanzpfad — Nachklang-Verlauf">
          <ResonanzChart data={resonanz} />
          <p style={{ fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: C.muted, marginTop: "0.75rem", lineHeight: 1.6 }}>
            Amber: Ø Resonanz · Gestrichelt: Überraschung / Innehalten / Mitgenommen
          </p>
        </Section>

        {/* Topic balance */}
        <Section c={C} title="Themenbalance — Welche Begriffe dominieren">
          <ThemenBalance data={themen} />
        </Section>
      </div>

      {total === 0 && (
        <div style={{ marginTop: "3rem", textAlign: "center", color: C.textDim, fontStyle: "italic", fontSize: "0.95rem", fontFamily: C.serif }}>
          Noch keine Gespräche gespeichert. Beginne ein Gespräch, schließe es ab und kehre hier zurück.
        </div>
      )}
    </div>
  );
}
