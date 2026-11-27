/**
 * Monatsbericht (/admin/monat). Begriffe, offene Fragen, Aufrufe.
 * Aufrufe sind nur Zählungen, ohne Personen.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES } from "@/data/conceptGraph";
import { callAdminGet } from "@/lib/adminAuth";
import AdminLayout from "@/pages/admin/AdminLayout";

interface Report {
  month: string;
  concepts: Array<{ id: string; count: number }>;
  questions: Array<{ sourceId: string; question: string; ts: string; followUp?: boolean }>;
  reads: Array<{ id: string; count: number; text: string }>;
}

const labels = new Map(NODES.map(node => [node.id, node.fullLabel]));

function MonatBody() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callAdminGet<Report>("monat").then(result => {
      if (result.ok && result.data) setReport(result.data);
      else setError(result.error ?? "Bericht nicht lesbar");
    });
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.2rem 1rem 2rem", color: C.text }}>
      <h1 style={{ fontFamily: DISPLAY, fontSize: "1.7rem", margin: "0.2rem 0" }}>Monatsbericht</h1>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>
        {report ? report.month : "lädt …"} · Aufrufe sind Summen, ohne Namen und ohne Adressen.
      </p>
      {error && <p style={{ fontFamily: SERIF, color: "#b91c1c" }}>{error}</p>}
      {report && (
        <>
          <Section C={C} title="Begriffe, die in diesem Monat wuchsen">
            {report.concepts.length === 0 && <Empty C={C} text="In diesem Monat noch kein gesicherter Zuwachs." />}
            {report.concepts.map(item => (
              <Row key={item.id} C={C} label={labels.get(item.id) ?? item.id} meta={`${item.count} neue Berührungen`} />
            ))}
          </Section>
          <Section C={C} title="Offene Folgefragen">
            {report.questions.length === 0 && <Empty C={C} text="Keine offene Frage im Fragenindex." />}
            {report.questions.map(item => (
              <Row key={item.sourceId} C={C} label={item.question} meta={`${item.ts.slice(0, 10)}${item.followUp ? " · Folgefrage" : ""}`} />
            ))}
          </Section>
          <Section C={C} title="Meistgelesene Erkenntnisse">
            {report.reads.length === 0 && <Empty C={C} text="Noch keine Aufrufe gezählt." />}
            {report.reads.map(item => (
              <Row key={item.id} C={C} label={item.text} meta={`${item.count} Aufrufe`} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ C, title, children }: { C: Palette; title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: "1.2rem" }}>
      <h2 style={{ fontFamily: DISPLAY, fontSize: "1.25rem", color: C.textBright }}>{title}</h2>
      <div style={{ display: "grid", gap: "0.45rem" }}>{children}</div>
    </section>
  );
}

function Row({ C, label, meta }: { C: Palette; label: string; meta: string }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.35rem" }}>
      <div style={{ fontFamily: SERIF, lineHeight: 1.45 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>{meta}</div>
    </div>
  );
}

function Empty({ C, text }: { C: Palette; text: string }) {
  return <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>{text}</p>;
}

export default function AdminMonatPage() {
  return <AdminLayout><MonatBody /></AdminLayout>;
}
