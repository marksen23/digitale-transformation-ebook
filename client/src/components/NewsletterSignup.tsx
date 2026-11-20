/**
 * Anmeldung zum Newsletter „Erkenntnis des Tages".
 * Double-Opt-in passiert serverseitig; ohne Versanddienst bleibt die
 * Adresse pending und das Formular sagt das.
 */
import { useEffect, useState } from "react";
import type { Palette } from "@/lib/theme";

type Tone = "cover" | "plain";

export default function NewsletterSignup({
  tone = "plain",
  C,
  compact = false,
}: {
  tone?: Tone;
  C?: Palette;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("weekly");
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/newsletter/status")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (live && data?.delivery === "log" && typeof data.note === "string") setNote(data.note);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  const cover = tone === "cover";
  const text = cover ? "#e7e5e4" : C?.text ?? "#1c1917";
  const dim = cover ? "#a8a29e" : C?.textDim ?? "#57534e";
  const accent = cover ? "#f59e0b" : C?.accentText ?? "#b45309";
  const border = cover ? "rgba(245,158,11,0.35)" : C?.border ?? "#d6d3d1";
  const fieldBg = cover ? "rgba(0,0,0,0.25)" : "transparent";

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, cadence, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(typeof data.error === "string" ? data.error : "Die Anmeldung hat nicht geklappt.");
      else setMessage(typeof data.message === "string" ? data.message : "Angemeldet.");
    } catch {
      setError("Die Anmeldung ist gerade nicht erreichbar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      id="newsletter"
      onSubmit={ev => { ev.preventDefault(); void submit(); }}
      style={{
        textAlign: "left",
        borderTop: `1px solid ${border}`,
        paddingTop: compact ? 12 : 16,
        marginTop: compact ? 8 : 12,
        display: "grid",
        gap: compact ? 8 : 10,
      }}
    >
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: compact ? 9 : 11, letterSpacing: "0.16em", textTransform: "uppercase", color: accent }}>
        Erkenntnis des Tages per E-Mail
      </div>
      <p style={{ margin: 0, fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: compact ? 12 : 14, lineHeight: 1.45, color: dim }}>
        Ein veröffentlichter Kernsatz, {cadence === "daily" ? "jeden Tag" : "einmal die Woche"}. Erst der Link in der Mail macht die Anmeldung wirksam.
      </p>
      {note && <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: compact ? 12 : 13, color: dim }}>{note}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 12rem", display: "grid", gap: 4 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: dim }}>E-Mail</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={ev => setEmail(ev.target.value)}
            placeholder="deine@adresse.de"
            style={{ fontFamily: "Georgia, serif", fontSize: compact ? 14 : 15, color: text, background: fieldBg, border: `1px solid ${border}`, borderRadius: 6, padding: "0.45rem 0.6rem" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: dim }}>Rhythmus</span>
          <select
            value={cadence}
            onChange={ev => setCadence(ev.target.value === "daily" ? "daily" : "weekly")}
            style={{ fontFamily: "Georgia, serif", fontSize: compact ? 14 : 15, color: text, background: fieldBg, border: `1px solid ${border}`, borderRadius: 6, padding: "0.45rem 0.6rem", minHeight: 36 }}
          >
            <option value="weekly">Wöchentlich</option>
            <option value="daily">Täglich</option>
          </select>
        </label>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: dim, fontFamily: "Georgia, serif", fontSize: compact ? 12 : 13, lineHeight: 1.4 }}>
        <input type="checkbox" checked={consent} onChange={ev => setConsent(ev.target.checked)} style={{ marginTop: 3 }} />
        <span>
          Ich willige ein, dass diese Adresse für den Newsletter gespeichert wird. Abmelden geht jederzeit über den Link in jeder Mail.{" "}
          <a href="/datenschutz" style={{ color: accent }}>Datenschutz</a>
          {" · "}
          <a href="/impressum" style={{ color: accent }}>Impressum</a>
        </span>
      </label>
      <div>
        <button
          type="submit"
          disabled={busy}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: cover ? "#fff" : accent, background: cover ? "#92400e" : "transparent", border: cover ? "none" : `1px solid ${border}`, borderRadius: 6, padding: "0.55rem 0.9rem", cursor: busy ? "wait" : "pointer", minHeight: 40 }}
        >
          {busy ? "…" : "Anmelden"}
        </button>
      </div>
      {message && <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 14, color: text }}>{message}</p>}
      {error && <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 14, color: "#b91c1c" }}>{error}</p>}
    </form>
  );
}
