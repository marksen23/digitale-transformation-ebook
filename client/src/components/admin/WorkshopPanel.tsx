/**
 * Admin: Gruppen-Werkstätten zählen und löschen.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { callAdminAction, callAdminGet } from "@/lib/adminAuth";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";

interface Contribution { id: string; author: string; text: string }
interface Workshop {
  code: string;
  title: string;
  conceptLabel: string;
  closedAt: string | null;
  contributions: Contribution[];
}

export default function WorkshopPanel({ C }: { C: Palette }) {
  const [rows, setRows] = useState<Workshop[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    callAdminGet<{ workshops?: Workshop[]; count?: number }>("werkstatt").then(r => {
      if (r.ok && r.data?.workshops) setRows(r.data.workshops);
      else setMsg(r.error ?? "Werkstätten nicht lesbar");
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeWorkshop = async (code: string) => {
    if (!window.confirm(`Werkstatt ${code} löschen?`)) return;
    setBusy(true);
    const r = await callAdminAction("werkstatt/delete", { code });
    setBusy(false);
    setMsg(r.ok ? "Gelöscht." : (r.error ?? "Löschen fehlgeschlagen"));
    if (r.ok) load();
  };

  const removeContribution = async (code: string, contributionId: string) => {
    setBusy(true);
    const r = await callAdminAction("werkstatt/delete", { code, contributionId });
    setBusy(false);
    setMsg(r.ok ? "Beitrag gelöscht." : (r.error ?? "Löschen fehlgeschlagen"));
    if (r.ok) load();
  };

  return (
    <section style={{ marginTop: "1.6rem" }}>
      <SectionLabel c={C}>Gruppen-Werkstatt</SectionLabel>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, fontSize: "0.9rem" }}>
        {rows ? `${rows.length} Werkstatt${rows.length === 1 ? "" : "en"}` : "lädt …"}
      </p>
      {msg && <p style={{ fontFamily: SERIF, color: C.textDim }}>{msg}</p>}
      <div style={{ display: "grid", gap: "0.8rem" }}>
        {(rows ?? []).map(row => (
          <article key={row.code} style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: "0.75rem", color: C.text }}>{row.code}</span>
              <span style={{ fontFamily: SERIF, color: C.textDim }}>{row.title} · {row.conceptLabel} · {row.contributions.length} Beiträge{row.closedAt ? " · abgeschlossen" : ""}</span>
              <button type="button" disabled={busy} onClick={() => removeWorkshop(row.code)} style={btn(C)}>Löschen</button>
            </div>
            {row.contributions.map(item => (
              <div key={item.id} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", marginTop: "0.3rem" }}>
                <span style={{ fontFamily: SERIF, fontSize: "0.85rem", color: C.textDim }}>{item.author}: {item.text.slice(0, 140)}</span>
                <button type="button" disabled={busy} onClick={() => removeContribution(row.code, item.id)} style={btn(C)}>Beitrag weg</button>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

function btn(C: Palette): CSSProperties {
  return {
    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase",
    color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 4,
    padding: "0.3rem 0.45rem", cursor: "pointer", minHeight: 28,
  };
}
