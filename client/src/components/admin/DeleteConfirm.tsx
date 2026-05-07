/**
 * DeleteConfirm — Modal-Dialog für Lösch-Bestätigung.
 * Wird sowohl im Admin-Dashboard als auch inline auf der Wissens-Seite genutzt.
 *
 * Pattern:
 *   role="dialog" + aria-modal="true"
 *   Backdrop-Klick schließt
 *   Esc-Schlüssel schließt (via useEffect)
 *   Loading-State während Delete-Call
 */
import { useEffect } from "react";
import { ENDPOINT_LABEL, type ResonanzEntry } from "@/lib/resonanzenIndex";

const SERIF = "'EB Garamond', Georgia, serif";
const MONO  = "'Courier Prime', 'Courier New', monospace";

interface DeleteConfirmProps {
  entry: ResonanzEntry;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Theme-Palette der aufrufenden Komponente */
  theme: {
    deep: string;
    border: string;
    muted: string;
    text: string;
  };
}

export default function DeleteConfirm({ entry, loading, onCancel, onConfirm, theme }: DeleteConfirmProps) {
  // Esc schließt
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.deep,
          border: `1px solid #c48282`,
          padding: "1.5rem",
          maxWidth: 420, width: "100%",
        }}
      >
        <div
          id="delete-confirm-title"
          style={{ fontFamily: MONO, fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#c48282", marginBottom: "0.8rem" }}
        >
          Eintrag löschen
        </div>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.92rem", color: theme.text, marginBottom: "0.5rem", lineHeight: 1.5 }}>
          {entry.prompt.slice(0, 150)}{entry.prompt.length > 150 ? "…" : ""}
        </p>
        <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: theme.muted, marginBottom: "1.2rem" }}>
          {ENDPOINT_LABEL[entry.endpoint]} · {entry.id}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
              color: theme.muted, background: "none",
              border: `1px solid ${theme.border}`,
              padding: "0.6rem 1rem", cursor: loading ? "wait" : "pointer",
              minHeight: 44,
            }}
          >abbrechen</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
              color: "#080808", background: "#c48282",
              border: "1px solid #c48282",
              padding: "0.6rem 1rem", cursor: loading ? "wait" : "pointer",
              minHeight: 44,
              opacity: loading ? 0.7 : 1,
            }}
          >{loading ? "lösche …" : "endgültig löschen"}</button>
        </div>
      </div>
    </div>
  );
}
