/**
 * OnboardingHint — dezenter Erstkontakt-Hinweis (Roadmap „Das wachsende Werk",
 * Phase 6). Orientiert neue Leser einmalig zu den Hauptwegen. Erscheint nur
 * beim allerersten Besuch (localStorage), dismissbar, nicht-intrusiv. Kein
 * Modal-Overlay — eine ruhige Karte oben im Inhalt.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, ORNAMENT, TRACKED, type Palette } from "@/lib/theme";

const KEY = "resonanzvernunft.onboarded";

const LINKS = [
  { href: "/werk", label: "Das Werk lesen" },
  { href: "/begriffsnetz", label: "Begriffsnetz erkunden" },
  { href: "/landkarte", label: "Wissens-Landkarte" },
  { href: "/resonanzen", label: "Wissen durchsuchen" },
];

export default function OnboardingHint() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setShow(true); } catch { /* private mode */ }
  }, []);

  function dismiss() {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div style={{ maxWidth: 900, margin: "0.9rem auto 0", padding: "0 1.5rem" }}>
      <div style={{ position: "relative", border: `1px solid ${C.border}`, background: `${C.accent}0c`, borderRadius: 8, padding: "0.9rem 2.2rem 0.9rem 1.1rem" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: TRACKED.open, textTransform: "uppercase", color: C.accentText, marginBottom: "0.35rem" }}>
          {ORNAMENT.leaf} Willkommen
        </div>
        <p style={{ margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "0.9rem", color: C.text, lineHeight: 1.55 }}>
          Ein lebendiges Werk über Resonanzvernunft — lesbar, erkundbar, weiterdenkbar. Wo möchtest du beginnen?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem" }}>
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={dismiss}
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase",
                color: C.accentText, textDecoration: "none",
                border: `1px solid ${C.accentDim}`, borderRadius: 3,
                padding: "0.35rem 0.6rem", minHeight: 30, display: "inline-flex", alignItems: "center",
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <button
          onClick={dismiss}
          aria-label="Hinweis schließen"
          style={{
            position: "absolute", top: "0.45rem", right: "0.55rem",
            fontFamily: SERIF, fontSize: "1rem", lineHeight: 1,
            color: C.muted, background: "none", border: "none", cursor: "pointer",
            padding: "0.2rem 0.35rem",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
