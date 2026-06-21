/**
 * AdminLayout — gemeinsamer Auth-Wrapper + Tab-Navigation für die drei
 * Admin-Sub-Routes (/admin, /admin/metrics, /admin/health).
 *
 * Auth-Check passiert einmalig beim Mount. Nicht-authentifizierte User
 * sehen Hilfe-Page mit Token-Hinweis.
 */
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import PageNav from "@/components/PageNav";
import { useAdminAuth } from "@/lib/adminAuth";
import { SERIF, MONO, C_DARK, C_LIGHT, type Palette } from "@/lib/theme";

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
  const [scrollRef, setScrollRef] = useState<HTMLElement | null>(null);

  // ─── Auth-States ───────────────────────────────────────────────────────
  if (state === "checking") {
    return <AuthShell c={C}><p style={{ fontStyle: "italic", color: C.textDim }}>prüfe Zugang …</p></AuthShell>;
  }
  // Hinweis zu "← Zum Werk"-Links: entfernt, weil der globale AppFrame
  // (siehe AppFrame.tsx) oben bereits den Werk-Link anbietet — auch in
  // den Auth-Gate-States.
  if (state === "missing") {
    return (
      <AuthShell c={C}>
        <h1 style={authH1Style(C)}>Admin-Zugang</h1>
        <p style={authPStyle(C)}>
          Kein Token gefunden. Aufruf via <code style={{ fontFamily: MONO, fontSize: "0.85rem", color: C.accentText }}>/admin?token=…</code>
        </p>
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
      </AuthShell>
    );
  }
  if (state === "not-configured") {
    return (
      <AuthShell c={C}>
        <h1 style={authH1Style(C)}>Admin-Zugang nicht konfiguriert</h1>
        <p style={authPStyle(C)}>
          <code style={{ fontFamily: MONO, fontSize: "0.85rem", color: C.accentText }}>ADMIN_TOKEN</code> env var auf Render setzen.
        </p>
      </AuthShell>
    );
  }

  // ─── Authorisiert → Tab-Layout + children ─────────────────────────────
  return (
    <div
      data-scroll
      ref={setScrollRef}
      style={{
        position: "fixed", top: 48, right: 0, bottom: 0, left: 0, overflowY: "auto",
        background: C.void, color: C.text, fontFamily: SERIF,
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "0.8rem 1rem 0", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: "1.3rem", color: C.textBright, margin: 0, fontWeight: 500, letterSpacing: "-0.01em" }}>
            Admin
          </h1>
          {/* Cross-page Nav-Links wurden entfernt — der globale AppFrame
              oben übernimmt die Navigation. Nur Logout bleibt admin-spezifisch. */}
          <button
            onClick={resetToken}
            title="Token zurücksetzen"
            style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.35rem 0.7rem", cursor: "pointer" }}
          >Logout</button>
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

      <PageNav scrollContainer={scrollRef} />
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
