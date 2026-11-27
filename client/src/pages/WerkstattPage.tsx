/**
 * Gruppen-Werkstatt (/werkstatt und /werkstatt/:code).
 * Teilbarer Code, Beiträge, Abschluss als herunterladbare Sammlung.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useRoute } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES } from "@/data/conceptGraph";
import SiteFooter from "@/components/SiteFooter";

interface Contribution {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

interface Workshop {
  code: string;
  conceptId: string;
  conceptLabel: string;
  title: string;
  createdAt: string;
  closedAt: string | null;
  contributions: Contribution[];
}

const field = (C: Palette): CSSProperties => ({
  fontFamily: SERIF,
  fontSize: "1rem",
  color: C.text,
  background: "transparent",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "0.45rem 0.6rem",
  width: "100%",
});

export default function WerkstattPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [, params] = useRoute("/werkstatt/:code");
  const code = params?.code?.toLowerCase() ?? "";
  const preset = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("begriff") ?? "";
  }, []);
  const [conceptId, setConceptId] = useState(NODES.some(node => node.id === preset) ? preset : NODES[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    let live = true;
    fetch(`/api/werkstatt/${encodeURIComponent(code)}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setError(typeof data.error === "string" ? data.error : "Werkstatt nicht gefunden");
        else setWorkshop(data.workshop as Workshop);
      })
      .catch(() => { if (live) setError("Die Werkstatt ist gerade nicht erreichbar."); });
    return () => { live = false; };
  }, [code]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/werkstatt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conceptId, title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(typeof data.error === "string" ? data.error : "Anlegen fehlgeschlagen");
      else window.location.assign(`/werkstatt/${data.workshop.code}`);
    } catch {
      setError("Anlegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const contribute = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/werkstatt/${encodeURIComponent(code)}/beitrag`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ author, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(typeof data.error === "string" ? data.error : "Beitrag fehlgeschlagen");
      else {
        setWorkshop(data.workshop as Workshop);
        setText("");
      }
    } catch {
      setError("Beitrag fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!window.confirm("Werkstatt abschließen? Danach sind keine weiteren Beiträge möglich.")) return;
    setBusy(true);
    const res = await fetch(`/api/werkstatt/${encodeURIComponent(code)}/abschluss`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setWorkshop(data.workshop as Workshop);
    else setError(typeof data.error === "string" ? data.error : "Abschluss fehlgeschlagen");
  };

  const copyLink = async () => {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>Gruppe</div>
        <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>
          {workshop ? workshop.title : "Gruppen-Werkstatt"}
        </h1>

        {!code && (
          <>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, lineHeight: 1.5 }}>
              Eine Runde zu einem Begriff. Der Code ist der Zugang. Am Ende lässt sich die Sammlung herunterladen.
            </p>
            <form onSubmit={ev => { ev.preventDefault(); void create(); }} style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Begriff</span>
                <select value={conceptId} onChange={ev => setConceptId(ev.target.value)} style={field(C)}>
                  {NODES.map(node => <option key={node.id} value={node.id}>{node.fullLabel}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Titel, falls gewünscht</span>
                <input value={title} onChange={ev => setTitle(ev.target.value)} maxLength={80} style={field(C)} />
              </label>
              <button type="submit" disabled={busy} style={button(C)}>{busy ? "…" : "Werkstatt öffnen"}</button>
            </form>
          </>
        )}

        {code && !workshop && !error && <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p>}

        {workshop && (
          <>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>
              {workshop.conceptLabel}
              {workshop.closedAt ? " · abgeschlossen" : " · offen"}
              {" · "}
              <Link href={`/landkarte?begriff=${encodeURIComponent(workshop.conceptId)}`} style={{ color: C.accentText }}>In der Landkarte</Link>
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.8rem 0 1rem" }}>
              <button type="button" onClick={() => void copyLink()} style={button(C)}>{copied ? "Link kopiert" : "Link teilen"}</button>
              <a href={`/api/werkstatt/${encodeURIComponent(workshop.code)}/export`} style={{ ...button(C), textDecoration: "none" }}>Sammlung laden</a>
              {!workshop.closedAt && <button type="button" onClick={() => void close()} style={button(C)}>Abschließen</button>}
            </div>
            <div style={{ fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.12em", color: C.accentText, marginBottom: "1rem" }}>{workshop.code}</div>
            <div style={{ display: "grid", gap: "0.7rem" }}>
              {workshop.contributions.length === 0 && <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>Noch keine Beiträge.</p>}
              {workshop.contributions.map((item, index) => (
                <article key={item.id} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.8rem 1rem", background: C.surface }}>
                  <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>
                    {index + 1}. {item.author} · {item.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                  <p style={{ fontFamily: SERIF, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{item.text}</p>
                </article>
              ))}
            </div>
            {!workshop.closedAt && (
              <form onSubmit={ev => { ev.preventDefault(); void contribute(); }} style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
                <input value={author} onChange={ev => setAuthor(ev.target.value)} placeholder="Name, wenn du willst" maxLength={40} style={field(C)} />
                <textarea value={text} onChange={ev => setText(ev.target.value)} required minLength={2} maxLength={2000} rows={5} placeholder="Deine Antwort zu diesem Begriff" style={field(C)} />
                <button type="submit" disabled={busy} style={button(C)}>{busy ? "…" : "Beitrag hinzufügen"}</button>
              </form>
            )}
          </>
        )}
        {error && <p style={{ fontFamily: SERIF, color: "#b91c1c" }}>{error}</p>}
        <SiteFooter c={C} />
      </div>
    </div>
  );
}

function button(C: Palette): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: "0.6rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: C.accentText,
    background: "none",
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    padding: "0.45rem 0.7rem",
    cursor: "pointer",
    minHeight: 36,
    display: "inline-flex",
    alignItems: "center",
  };
}
