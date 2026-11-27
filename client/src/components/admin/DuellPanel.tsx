/**
 * Admin: Stimmen der Begriffs-Duelle löschen.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { callAdminAction, callAdminGet } from "@/lib/adminAuth";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";

interface Vote { id: string; duelId: string; side: string; author: string; reason: string; createdAt: string }

export default function DuellPanel({ C }: { C: Palette }) {
  const [votes, setVotes] = useState<Vote[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    callAdminGet<{ votes?: Vote[] }>("duelle").then(r => {
      if (r.ok && r.data?.votes) setVotes(r.data.votes);
      else setMsg(r.error ?? "Duelle nicht lesbar");
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    const r = await callAdminAction("duelle/delete", { id });
    setMsg(r.ok ? "Stimme gelöscht." : (r.error ?? "Löschen fehlgeschlagen"));
    if (r.ok) load();
  };

  return (
    <section style={{ marginTop: "1.6rem" }}>
      <SectionLabel c={C}>Begriffs-Duelle</SectionLabel>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>{votes ? `${votes.length} Stimmen` : "lädt …"}</p>
      {msg && <p style={{ fontFamily: SERIF, color: C.textDim }}>{msg}</p>}
      {(votes ?? []).map(vote => (
        <div key={vote.id} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", borderTop: `1px solid ${C.border}`, paddingTop: "0.35rem" }}>
          <span style={{ fontFamily: SERIF, fontSize: "0.85rem", color: C.textDim }}>{vote.duelId} · {vote.side} · {vote.author}: {vote.reason.slice(0, 120)}</span>
          <button type="button" onClick={() => remove(vote.id)} style={btn(C)}>Löschen</button>
        </div>
      ))}
    </section>
  );
}

function btn(C: Palette): CSSProperties {
  return { fontFamily: MONO, fontSize: "0.55rem", color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.25rem 0.4rem", cursor: "pointer" };
}
