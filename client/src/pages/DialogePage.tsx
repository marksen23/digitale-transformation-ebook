/**
 * Leser-Dialoge (/dialoge und /dialoge/:conceptId).
 * Nur Lesen, nur aus dem öffentlichen Korpus.
 */
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES } from "@/data/conceptGraph";
import { loadResonanzenIndexLazy } from "@/lib/resonanzenIndex";
import { buildDialogThreads, conceptsWithDialogs, type DialogThread, type PublicDialogEntry, type ThreadKind } from "@/lib/dialogThreads";
import SiteFooter from "@/components/SiteFooter";

const labels = new Map(NODES.map(n => [n.id, n.fullLabel]));
const KIND: Record<ThreadKind, string> = {
  weiterdenken: "Weiterdenken",
  dialog: "Dialog",
  "graph-chat": "Begriffsnetz",
};

function clip(text: string, max = 700): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function ThreadView({ C, thread }: { C: Palette; thread: DialogThread }) {
  return (
    <article style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.9rem 1rem", background: C.surface, display: "grid", gap: "0.9rem" }}>
      {thread.steps.map((step, i) => (
        <div key={step.id}>
          <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
            {i === 0 ? "Frage" : "weitergedacht"} · {KIND[step.kind]}
          </div>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textBright, lineHeight: 1.45, margin: "0.25rem 0" }}>{step.question}</p>
          {step.reader && (
            <p style={{ fontFamily: SERIF, color: C.text, lineHeight: 1.5, margin: "0.3rem 0" }}>
              <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.accentText }}>Leser · </span>
              {clip(step.reader, 400)}
            </p>
          )}
          <p style={{ fontFamily: SERIF, color: C.textDim, lineHeight: 1.55, margin: "0.3rem 0" }}>{clip(step.answer)}</p>
          {step.nextQuestion && i === thread.steps.length - 1 && (
            <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted, margin: "0.3rem 0" }}>Offen: {step.nextQuestion}</p>
          )}
          <Link href={`/resonanz/${encodeURIComponent(step.id)}`} style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accentText }}>im Korpus lesen</Link>
        </div>
      ))}
    </article>
  );
}

export default function DialogePage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [, params] = useRoute("/dialoge/:conceptId");
  const [entries, setEntries] = useState<PublicDialogEntry[] | null>(null);

  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => setEntries((idx?.entries ?? []) as PublicDialogEntry[]));
  }, []);

  const conceptId = params?.conceptId ? decodeURIComponent(params.conceptId) : "";
  const concepts = entries ? conceptsWithDialogs(entries) : [];
  const threads = entries && conceptId ? buildDialogThreads(entries, conceptId) : [];
  const title = labels.get(conceptId) ?? conceptId;

  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>Korpus</div>
        {conceptId ? (
          <>
            <Link href="/dialoge" style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accentText, textDecoration: "none" }}>Alle Dialoge</Link>
            <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>{title}</h1>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>
              Gesicherte Fragen, Antworten und Weiterdenken-Folgen zu diesem Begriff.{" "}
              <Link href={`/landkarte?begriff=${encodeURIComponent(conceptId)}`} style={{ color: C.accentText }}>In der Landkarte</Link>
            </p>
            {!entries ? <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p>
              : threads.length === 0 ? <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>Zu diesem Begriff gibt es noch keinen gesicherten Dialog.</p>
              : <div style={{ display: "grid", gap: "0.8rem" }}>{threads.map(t => <ThreadView key={t.id} C={C} thread={t} />)}</div>}
          </>
        ) : (
          <>
            <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>Leser-Dialoge</h1>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, maxWidth: "40rem" }}>
              Fäden aus dem gesicherten Korpus: eine Frage, die Antwort, und wo eine spätere Resonanz die Schlussfrage aufnimmt, die Fortsetzung.
            </p>
            {!entries ? <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p> : (
              <div style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
                {concepts.map(row => (
                  <Link key={row.id} href={`/dialoge/${encodeURIComponent(row.id)}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <article style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.8rem 1rem", background: C.surface }}>
                      <h2 style={{ margin: 0, fontFamily: DISPLAY, fontSize: "1.2rem", color: C.textBright }}>{labels.get(row.id) ?? row.id}</h2>
                      <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accentText, marginTop: "0.35rem" }}>
                        {row.threads} {row.threads === 1 ? "Faden" : "Fäden"} · {row.steps} Schritte
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
        <SiteFooter c={C} />
      </div>
    </div>
  );
}
