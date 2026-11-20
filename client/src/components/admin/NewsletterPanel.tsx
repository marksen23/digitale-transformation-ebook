/**
 * Admin: Anzahl der Newsletter-Adressen, Löschen, Digest anstoßen.
 * Die Liste ist nur mit Admin-Token sichtbar.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { callAdminAction, callAdminGet } from "@/lib/adminAuth";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";

interface Row {
  email: string;
  status: "pending" | "confirmed";
  cadence: "daily" | "weekly";
  createdAt: string;
  confirmedAt: string | null;
}

interface Overview {
  counts: { pending: number; confirmed: number };
  subscribers: Row[];
  provider: string;
  delivery: "ready" | "log";
}

export default function NewsletterPanel({ C }: { C: Palette }) {
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    callAdminGet<Overview>("newsletter").then(r => {
      if (r.ok && r.data) setData(r.data);
      else setMsg(r.error ?? "Newsletter nicht lesbar");
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (email: string) => {
    if (!window.confirm(`Adresse ${email} löschen?`)) return;
    setBusy(true);
    const r = await callAdminAction("newsletter/delete", { email });
    setBusy(false);
    setMsg(r.ok ? "Gelöscht." : (r.error ?? "Löschen fehlgeschlagen"));
    if (r.ok) load();
  };

  const digest = async (cadence: "daily" | "weekly") => {
    setBusy(true);
    const r = await callAdminAction<{ report?: { delivered: number; logged: number; skipped: string | null; recipients: number } }>("newsletter/digest", { cadence });
    setBusy(false);
    const report = r.data?.report;
    setMsg(r.ok && report
      ? `Digest ${cadence}: ${report.delivered} gesendet, ${report.logged} nur protokolliert, ${report.recipients} Empfänger${report.skipped ? ` (${report.skipped})` : ""}.`
      : (r.error ?? "Digest fehlgeschlagen"));
  };

  const resend = async () => {
    setBusy(true);
    const r = await callAdminAction<{ pending?: number; delivered?: number; logged?: number }>("newsletter/resend-confirm", {});
    setBusy(false);
    setMsg(r.ok
      ? `Bestätigungen: ${r.data?.pending ?? 0} offen, ${r.data?.delivered ?? 0} gesendet, ${r.data?.logged ?? 0} nur protokolliert.`
      : (r.error ?? "Nachschicken fehlgeschlagen"));
  };

  return (
    <section style={{ marginTop: "1.6rem" }}>
      <SectionLabel c={C}>Newsletter</SectionLabel>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, fontSize: "0.9rem", lineHeight: 1.5 }}>
        Erkenntnis des Tages. Adressen liegen nur auf dem Server.
        {data?.delivery === "log" ? " Versand ist nicht eingerichtet — es geht keine Mail hinaus." : ` Versand über ${data?.provider ?? "den Anbieter"}.`}
      </p>
      <div style={{ fontFamily: MONO, fontSize: "0.65rem", color: C.text, marginBottom: "0.6rem" }}>
        {data ? `${data.counts.confirmed} bestätigt · ${data.counts.pending} unbestätigt` : "lädt …"}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.7rem" }}>
        <button type="button" disabled={busy} onClick={() => digest("daily")} style={btn(C)}>Digest täglich</button>
        <button type="button" disabled={busy} onClick={() => digest("weekly")} style={btn(C)}>Digest wöchentlich</button>
        <button type="button" disabled={busy} onClick={resend} style={btn(C)}>Bestätigungen nachschicken</button>
      </div>
      {msg && <p style={{ fontFamily: SERIF, color: C.textDim, fontSize: "0.85rem" }}>{msg}</p>}
      <div style={{ display: "grid", gap: "0.35rem" }}>
        {(data?.subscribers ?? []).map(row => (
          <div key={row.email} style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: "0.35rem" }}>
            <span style={{ fontFamily: MONO, fontSize: "0.7rem", color: C.text }}>{row.email}</span>
            <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: C.muted }}>{row.status === "confirmed" ? "bestätigt" : "unbestätigt"} · {row.cadence === "daily" ? "täglich" : "wöchentlich"}</span>
            <button type="button" disabled={busy} onClick={() => remove(row.email)} style={btn(C)}>Löschen</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function btn(C: Palette): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: "0.6rem",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: C.accentText,
    background: "none",
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    padding: "0.35rem 0.55rem",
    cursor: "pointer",
    minHeight: 32,
  };
}
