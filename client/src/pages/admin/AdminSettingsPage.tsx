/**
 * AdminSettingsPage (/admin/settings) — Kuratierungs-Schwellenwerte +
 * KI-Backend-Wahl, bisher nur über Env-Vars (Render-Redeploy nötig)
 * änderbar. Liest/schreibt server/lib/adminConfig.ts über
 * GET/POST /api/admin/config. Desktop-only (siehe AdminLayout.tsx) —
 * Schwellenwert-Tuning ist kein glanceable mobiler Anwendungsfall.
 */
import { useEffect, useState } from "react";
import { Section, useAdminTheme, MONO, SERIF } from "./adminShared";
import { callAdminAction, callAdminGet } from "@/lib/adminAuth";
import { recordAction } from "@/lib/adminActionLog";

interface ConfigField {
  key: string;
  label: string;
  group: string;
  type: "number" | "enum";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  value: number | string;
  source: "override" | "default";
  envDefault: number | string;
}
interface ConfigResponse { ok: boolean; fields: ConfigField[]; updatedAt: string | null }

export default function AdminSettingsPage() {
  const C = useAdminTheme();
  const [fields, setFields] = useState<ConfigField[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function load() {
    setError(null);
    callAdminGet<ConfigResponse>("config").then(res => {
      if (!res.ok || !res.data) { setError(res.error ?? "Konfiguration nicht ladbar"); return; }
      setFields(res.data.fields);
      setUpdatedAt(res.data.updatedAt);
      setEdits({});
    });
  }
  useEffect(load, []);

  if (error) {
    return <p style={{ fontStyle: "italic", color: "#c48282" }}>{error}</p>;
  }
  if (!fields) {
    return <p style={{ fontStyle: "italic", color: C.textDim }}>lädt …</p>;
  }

  const groups = Array.from(new Set(fields.map(f => f.group)));
  const dirtyKeys = Object.keys(edits).filter(k => {
    const f = fields.find(x => x.key === k);
    return f && edits[k] !== String(f.value);
  });

  async function handleSave() {
    const patch: Record<string, number | string> = {};
    for (const key of dirtyKeys) {
      const f = fields!.find(x => x.key === key)!;
      patch[key] = f.type === "number" ? parseFloat(edits[key]) : edits[key];
    }
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setSaveMsg(null);
    const r = await callAdminAction<{ updatedKeys: string[] }>("config", { values: patch });
    recordAction({
      type: "config-update", targetCount: Object.keys(patch).length, ok: r.ok,
      reason: r.ok ? undefined : r.error,
      payload: patch,
    });
    setSaving(false);
    if (r.ok) {
      setSaveMsg(`${Object.keys(patch).length} Einstellung(en) gespeichert.`);
      load();
    } else {
      setSaveMsg(`Fehler: ${r.error ?? "unbekannt"}`);
    }
  }

  return (
    <>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, lineHeight: 1.5, marginTop: 0 }}>
        Schwellenwerte für Auto-Kuratierung, neue Begriffe und die KI-Backend-Wahl für
        Pre-Score/Master-Synthese. Änderungen werden nach <code style={{ fontFamily: MONO, color: C.accentText }}>content/admin-config.json</code> geschrieben
        (Git-Commit) und wirken serverseitig sofort — kein Redeploy nötig.
        {updatedAt && <> Letzte Änderung: {new Date(updatedAt).toLocaleString("de-DE")}.</>}
      </p>

      {groups.map(group => (
        <Section key={group} title={group} c={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {fields.filter(f => f.group === group).map(f => {
              const currentVal = edits[f.key] ?? String(f.value);
              const isDirty = dirtyKeys.includes(f.key);
              return (
                <div key={f.key} style={{
                  display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap",
                  padding: "0.5rem 0.7rem",
                  background: isDirty ? "rgba(126,184,200,0.06)" : C.surface,
                  border: `1px solid ${isDirty ? "rgba(126,184,200,0.35)" : C.border}`,
                  borderLeft: `3px solid ${isDirty ? "#5aacb8" : C.border}`,
                }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: "0.65rem", color: C.text }}>{f.label}</div>
                    <div style={{ fontFamily: MONO, fontSize: "0.48rem", color: C.muted, letterSpacing: "0.03em", marginTop: "0.15rem" }}>
                      {f.key} · {f.source === "override" ? "eigener Wert" : `Env-Default (${f.envDefault})`}
                    </div>
                  </div>
                  {f.type === "number" ? (
                    <input
                      type="number"
                      value={currentVal}
                      min={f.min} max={f.max} step={f.step}
                      onChange={e => setEdits(v => ({ ...v, [f.key]: e.target.value }))}
                      style={{
                        fontFamily: MONO, fontSize: "0.7rem", color: C.text,
                        background: C.void, border: `1px solid ${C.border}`,
                        padding: "0.35rem 0.5rem", width: 90, minHeight: 32,
                      }}
                    />
                  ) : (
                    <select
                      value={currentVal}
                      onChange={e => setEdits(v => ({ ...v, [f.key]: e.target.value }))}
                      style={{
                        fontFamily: MONO, fontSize: "0.7rem", color: C.text,
                        background: C.void, border: `1px solid ${C.border}`,
                        padding: "0.35rem 0.5rem", minHeight: 32,
                      }}
                    >
                      {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ))}

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => void handleSave()}
          disabled={dirtyKeys.length === 0 || saving}
          style={{
            fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
            color: dirtyKeys.length === 0 ? C.muted : C.void,
            background: dirtyKeys.length === 0 ? "none" : "#7ab898",
            border: `1px solid ${dirtyKeys.length === 0 ? C.border : "#7ab898"}`,
            padding: "0.6rem 1rem", minHeight: 36,
            cursor: dirtyKeys.length === 0 || saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "speichert …" : dirtyKeys.length > 0 ? `${dirtyKeys.length} Änderung(en) speichern` : "Speichern"}
        </button>
        {dirtyKeys.length > 0 && !saving && (
          <button
            onClick={() => setEdits({})}
            style={{
              fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
              color: C.muted, background: "none", border: "none", cursor: "pointer",
              textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px",
            }}
          >
            verwerfen
          </button>
        )}
        {saveMsg && (
          <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: saveMsg.startsWith("Fehler") ? "#c48282" : "#7ab898" }}>
            {saveMsg}
          </span>
        )}
      </div>
    </>
  );
}
