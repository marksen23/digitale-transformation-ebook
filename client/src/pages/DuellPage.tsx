/**
 * Begriffs-Duelle (/duelle). Stimme, Begründung, Stand.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import type { Duel } from "@shared/duelle";
import SiteFooter from "@/components/SiteFooter";

interface Vote { id: string; side: "a" | "b"; reason: string; author: string; createdAt: string }
interface DuelView extends Duel { aCount: number; bCount: number; reasons: Vote[] }

export default function DuellPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [duels, setDuels] = useState<DuelView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/duelle")
      .then(r => r.json())
      .then(data => {
        setDuels((data.duels ?? []) as DuelView[]);
      })
      .catch(() => setError("Die Duelle sind gerade nicht erreichbar."));
  };

  useEffect(() => { load(); }, []);

  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>Begriffe</div>
        <h1 style={{ margin: "0.4rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>Begriffs-Duelle</h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, lineHeight: 1.5 }}>
          Eine Seite, eine kurze Begründung. Die Begründung geht mit dem Zeitpunkt in den Korpus. Der Admin kann Stimmen löschen.
        </p>
        {error && <p style={{ fontFamily: SERIF, color: "#b91c1c" }}>{error}</p>}
        {!duels && !error && <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p>}
        <div style={{ display: "grid", gap: "1.2rem" }}>
          {(duels ?? []).map(duel => <DuelCard key={duel.id} C={C} duel={duel} onVoted={load} onError={setError} />)}
        </div>
        <SiteFooter c={C} />
      </div>
    </div>
  );
}

function DuelCard({ C, duel, onVoted, onError }: { C: Palette; duel: DuelView; onVoted: () => void; onError: (msg: string) => void }) {
  const [side, setSide] = useState<"a" | "b" | null>(null);
  const [reason, setReason] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const total = duel.aCount + duel.bCount;
  const aShare = total ? Math.round((duel.aCount / total) * 100) : 50;
  const submit = async () => {
    if (!side) { onError("Bitte eine Seite wählen."); return; }
    setBusy(true);
    onError("");
    try {
      const res = await fetch(`/api/duelle/${duel.id}/stimme`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ side, reason, author }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) onError(typeof data.error === "string" ? data.error : "Die Stimme hat nicht geklappt.");
      else { setReason(""); onVoted(); }
    } catch {
      onError("Die Stimme hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "1rem", background: C.surface }}>
      <h2 style={{ margin: 0, fontFamily: DISPLAY, fontSize: "1.35rem", color: C.textBright }}>{duel.title}</h2>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim }}>{duel.question}</p>
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: C.border, margin: "0.4rem 0 0.3rem" }}>
        <div style={{ width: `${aShare}%`, background: C.accentText }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>
        <span>{duel.a.label} {duel.aCount}</span>
        <span>{duel.b.label} {duel.bCount}</span>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.7rem" }}>
        {(["a", "b"] as const).map(key => {
          const label = key === "a" ? duel.a.label : duel.b.label;
          return (
            <button key={key} type="button" onClick={() => setSide(key)} style={{
              flex: 1, minHeight: 36, cursor: "pointer", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase",
              color: side === key ? C.void : C.accentText, background: side === key ? C.accentText : "none", border: `1px solid ${C.border}`, borderRadius: 4,
            }}>
              {label}
            </button>
          );
        })}
      </div>
      <form onSubmit={ev => { ev.preventDefault(); void submit(); }} style={{ display: "grid", gap: "0.45rem", marginTop: "0.7rem" }}>
        <input value={author} onChange={ev => setAuthor(ev.target.value)} placeholder="Name, wenn du willst" maxLength={40} style={field(C)} />
        <textarea value={reason} onChange={ev => setReason(ev.target.value)} required minLength={10} maxLength={600} rows={3} placeholder="Warum diese Seite?" style={field(C)} />
        <button type="submit" disabled={busy} style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 4, minHeight: 36, cursor: "pointer" }}>
          {busy ? "…" : "Stimme abgeben"}
        </button>
      </form>
      <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.45rem" }}>
        {duel.reasons.slice(0, 8).map(vote => (
          <p key={vote.id} style={{ margin: 0, fontFamily: SERIF, fontSize: "0.92rem", lineHeight: 1.45 }}>
            <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.accentText }}>
              {vote.side === "a" ? duel.a.label : duel.b.label} · {vote.createdAt.slice(0, 16).replace("T", " ")} · {vote.author}
            </span>
            <br />{vote.reason}
          </p>
        ))}
      </div>
    </article>
  );
}

function field(C: Palette): CSSProperties {
  return { fontFamily: SERIF, color: C.text, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.4rem 0.55rem", width: "100%" };
}
