/**
 * AdminLayout — gemeinsamer Auth-Wrapper + Tab-Navigation für die drei
 * Admin-Sub-Routes (/admin, /admin/metrics, /admin/health).
 *
 * Auth-Check passiert einmalig beim Mount. Nicht-authentifizierte User
 * sehen Hilfe-Page mit Token-Hinweis.
 */
import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { useAdminAuth } from "@/lib/adminAuth";

const SERIF = "'EB Garamond', Georgia, serif";
const MONO  = "'Courier Prime', 'Courier New', monospace";

type Palette = {
  void: string; deep: string; surface: string; border: string;
  muted: string; textDim: string; text: string; textBright: string;
  accent: string; accentDim: string;
};
const C_DARK: Palette = {
  void: "#080808", deep: "#0f0f0f", surface: "#161616", border: "#2a2a2a",
  muted: "#444", textDim: "#888", text: "#c8c2b4", textBright: "#e8e2d4",
  accent: "#c4a882", accentDim: "#7a6a52",
};
const C_LIGHT: Palette = {
  void: "#fafaf9", deep: "#f0ece4", surface: "#ffffff", border: "#d8d2c8",
  muted: "#a8a29e", textDim: "#78716c", text: "#3a3530", textBright: "#1c1917",
  accent: "#c4a882", accentDim: "#7a6a52",
};

const TABS: Array<{ path: string; label: string }> = [
  { path: "/admin",         label: "Kuration" },
  { path: "/admin/metrics", label: "Metrics" },
  { path: "/admin/health",  label: "Health" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;
  const [location] = useLocation();
  const { state, error, resetToken } = useAdminAuth();

  // ─── Auth-States ───────────────────────────────────────────────────────
  if (state === "checking") {
    return <AuthShell c={C}><p style={{ fontStyle: "italic", color: C.textDim }}>prüfe Zugang …</p></AuthShell>;
  }
  if (state === "missing") {
    return (
      <AuthShell c={C}>
        <h1 style={authH1Style(C)}>Admin-Zugang</h1>
        <p style={authPStyle(C)}>
          Kein Token gefunden. Aufruf via <code style={{ fontFamily: MONO, fontSize: "0.85rem", color: C.accent }}>/admin?token=…</code>
        </p>
        <Link href="/" style={backLinkStyle(C)}>← Zum Werk</Link>
      </AuthShell>
    );
  }
  if (state === "invalid") {
    return (
      <AuthShell c={C}>
        <h1 style={authH1Style(C)}>Nicht autorisiert</h1>
        <p style={authPStyle(C)}>{error}</p>
        <button
          onClick={resetToken}
          style={{ marginTop: "1rem", fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.5rem 1rem", cursor: "pointer" }}
        >Token zurücksetzen</button>
        <Link href="/" style={backLinkStyle(C)}>← Zum Werk</Link>
      </AuthShell>
    );
  }
  if (state === "not-configured") {
    return (
      <AuthShell c={C}>
        <h1 style={authH1Style(C)}>Admin-Zugang nicht konfiguriert</h1>
        <p style={authPStyle(C)}>
          <code style={{ fontFamily: MONO, fontSize: "0.85rem", color: C.accent }}>ADMIN_TOKEN</code> env var auf Render setzen.
        </p>
        <Link href="/" style={backLinkStyle(C)}>← Zum Werk</Link>
      </AuthShell>
    );
  }

  // ─── Authorisiert → Tab-Layout + children ─────────────────────────────
  return (
    <div
      data-scroll
      style={{
        position: "fixed", inset: 0, overflowY: "auto",
        background: C.void, color: C.text, fontFamily: SERIF,
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "1.5rem 1rem 0", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.8rem", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: "1.6rem", fontStyle: "italic", color: C.textBright, margin: 0, fontWeight: 400 }}>
            Admin
          </h1>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
            <Link href="/philosophie" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Philosophie</Link>
            <Link href="/resonanzen" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Kollektives Wissen</Link>
            <Link href="/" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
            <button
              onClick={resetToken}
              title="Token zurücksetzen"
              style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.3rem 0.6rem", cursor: "pointer" }}
            >Logout</button>
          </div>
        </div>
        {/* Tab-Bar */}
        <nav style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {TABS.map(tab => {
            const active = location === tab.path;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                style={{
                  fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase",
                  color: active ? C.textBright : C.muted,
                  background: active ? C.deep : "none",
                  border: `1px solid ${active ? C.accentDim : C.border}`,
                  borderBottom: active ? `1px solid ${C.deep}` : `1px solid ${C.border}`,
                  padding: "0.6rem 1rem",
                  textDecoration: "none",
                  marginBottom: "-1px",
                  minHeight: 36,
                  display: "inline-block",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem 4rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {children}
      </main>
    </div>
  );
}

// ─── Helper-Components für die Auth-States ─────────────────────────────────

function AuthShell({ children, c }: { children: ReactNode; c: Palette }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: c.void, color: c.text, fontFamily: SERIF, padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
  );
}

function authH1Style(c: Palette): React.CSSProperties {
  return { fontFamily: SERIF, fontSize: "2rem", fontStyle: "italic", color: c.textBright, marginBottom: "1rem", fontWeight: 400 };
}
function authPStyle(c: Palette): React.CSSProperties {
  return { fontStyle: "italic", color: c.textDim, marginBottom: "0.5rem", textAlign: "center" };
}
function backLinkStyle(c: Palette): React.CSSProperties {
  return { marginTop: "2rem", color: c.accent, fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase" };
}
