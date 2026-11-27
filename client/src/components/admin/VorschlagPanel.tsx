/**
 * Admin: Leser-Vorschläge heben oder zurückziehen.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { callAdminAction, callAdminGet } from "@/lib/adminAuth";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";

interface Proposal {
  id: string;
  kind: "concept" | "edge";
  author: string;
  reason: string;
  createdAt: string;
  source?: string;
  target?: string;
  fullLabel?: string;
  description?: string;
  anchorId?: string;
}

export default function VorschlagPanel({ C }: { C: Palette }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    callAdminGet<{ proposals?: Proposal[] }>("vorschlaege").then(result => {
      if (result.ok && result.data?.proposals) setProposals(result.data.proposals);
      else setMsg(result.error ?? "Vorschläge nicht lesbar");
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action: "vorschlaege/promote" | "vorschlaege/delete", id: string, done: string) => {
    const result = await callAdminAction(action, { id });
    setMsg(result.ok ? done : (result.error ?? "Das ging nicht."));
    if (result.ok) load();
  };

  return (
    <section style={{ marginTop: "1.6rem" }}>
      <SectionLabel c={C}>Leser-Vorschläge</SectionLabel>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>
        {proposals ? `${proposals.length} offen` : "lädt …"} · Noch nicht im Netz, bis sie gehoben werden.
      </p>
      {msg && <p style={{ fontFamily: SERIF, color: C.textDim }}>{msg}</p>}
      {(proposals ?? []).map(proposal => (
        <div key={proposal.id} style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.4rem", marginTop: "0.4rem" }}>
          <div style={{ fontFamily: SERIF, fontSize: "0.9rem" }}>
            {proposal.kind === "edge"
              ? `${proposal.source} — ${proposal.target}`
              : `${proposal.fullLabel} an ${proposal.anchorId}`}
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>{proposal.reason}</div>
          {proposal.description && <div style={{ fontFamily: SERIF, color: C.textDim }}>{proposal.description}</div>}
          <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>{proposal.author} · {proposal.createdAt.slice(0, 10)}</div>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
            <button type="button" onClick={() => act("vorschlaege/promote", proposal.id, "In den Kanon gehoben.")} style={btn(C)}>Heben</button>
            <button type="button" onClick={() => act("vorschlaege/delete", proposal.id, "Zurückgezogen.")} style={btn(C)}>Zurückziehen</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function btn(C: Palette): CSSProperties {
  return {
    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase",
    color: C.text, background: "none", border: `1px solid ${C.border}`, padding: "0.3rem 0.5rem", cursor: "pointer",
  };
}
