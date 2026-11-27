/**
 * Leser schlagen auf der Landkarte einen Begriff oder eine Verbindung vor.
 * Der Vorschlag bleibt ausstehend, bis der Admin ihn hebt.
 */
import { useState, type CSSProperties } from "react";
import { MONO, RADIUS, SERIF, type Palette } from "@/lib/theme";

interface NodeOption {
  id: string;
  fullLabel: string;
}

export default function BegriffVorschlag({
  C, anchorId, nodes,
}: {
  C: Palette;
  anchorId: string;
  nodes: NodeOption[];
}) {
  const [other, setOther] = useState("");
  const [edgeReason, setEdgeReason] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [conceptReason, setConceptReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const others = nodes.filter(node => node.id !== anchorId);

  async function send(body: Record<string, string>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/vorschlaege", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Der Vorschlag ging nicht durch.");
        return;
      }
      setMsg("Liegt vor. Er wird erst sichtbar, wenn er im Admin gehoben wird.");
      setEdgeReason("");
      setConceptReason("");
      setLabel("");
      setDescription("");
    } catch {
      setMsg("Der Vorschlag ging nicht durch.");
    } finally {
      setBusy(false);
    }
  }

  const field: CSSProperties = {
    width: "100%", boxSizing: "border-box", fontFamily: SERIF, fontSize: "0.85rem",
    color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.35rem 0.45rem",
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: "0.35rem" }}>
        Vorschlagen
      </div>
      <form onSubmit={event => { event.preventDefault(); void send({ kind: "edge", source: anchorId, target: other, reason: edgeReason }); }} style={{ display: "grid", gap: "0.35rem" }}>
        <select value={other} onChange={event => setOther(event.target.value)} aria-label="Zweiter Begriff" style={field}>
          <option value="">Verbindung zu …</option>
          {others.map(node => <option key={node.id} value={node.id}>{node.fullLabel}</option>)}
        </select>
        <textarea value={edgeReason} onChange={event => setEdgeReason(event.target.value)} rows={2} placeholder="Warum gehören die beiden zusammen?" style={field} />
        <button type="submit" disabled={busy} style={button(C)}>{busy ? "…" : "Verbindung vorschlagen"}</button>
      </form>
      <form onSubmit={event => { event.preventDefault(); void send({ kind: "concept", anchorId, fullLabel: label, description, reason: conceptReason }); }} style={{ display: "grid", gap: "0.35rem", marginTop: "0.7rem" }}>
        <input value={label} onChange={event => setLabel(event.target.value)} placeholder="Neuer Begriff" aria-label="Neuer Begriff" style={field} />
        <textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} placeholder="Was meint der Begriff, in einem Satz?" style={field} />
        <textarea value={conceptReason} onChange={event => setConceptReason(event.target.value)} rows={2} placeholder="Warum fehlt er am gewählten Begriff?" style={field} />
        <button type="submit" disabled={busy} style={button(C)}>{busy ? "…" : "Begriff vorschlagen"}</button>
      </form>
      {msg && <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem", color: C.textDim }}>{msg}</p>}
    </div>
  );
}

function button(C: Palette): CSSProperties {
  return {
    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase",
    color: C.accentText, background: "none", border: `1px solid ${C.accentDim}`,
    borderRadius: RADIUS.micro, padding: "0.4rem 0.55rem", cursor: "pointer", minHeight: 32,
  };
}
