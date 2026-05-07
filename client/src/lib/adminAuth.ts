/**
 * adminAuth.ts — Token-basierte Admin-Authentifizierung.
 *
 * Wiederverwendbar in AdminLayout (gemeinsamer Auth-Wrapper) UND
 * ResonanzenPage (für Inline-Lösch-Trigger). Token wird einmalig via
 * /admin?token=XYZ gesetzt, danach in localStorage gehalten.
 */
import { useEffect, useState } from "react";

export const ADMIN_TOKEN_KEY = "dt-admin-token";

export type AdminAuthState = "checking" | "missing" | "invalid" | "ok" | "not-configured";

/** Liest den Token aus localStorage; bei ?token=… in URL: speichert + räumt URL auf. */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("token");
  if (fromUrl) {
    localStorage.setItem(ADMIN_TOKEN_KEY, fromUrl);
    // URL aufräumen — Token darf nicht im Browser-Verlauf landen
    params.delete("token");
    const cleanQuery = params.toString();
    const cleanUrl = window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "");
    window.history.replaceState({}, "", cleanUrl);
    return fromUrl;
  }
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

/** Validiert einen Token gegen den Server. */
export async function checkAdminToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/check", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const data = await res.json();
    return { ok: !!data.ok, error: data.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Hook: Auth-State + Token + Reset-Funktion.
 *  Returnt 'ok' nur wenn Token gesetzt UND Server-Validierung erfolgreich.
 *  Inline-Komponenten können `state === 'ok'` als Permission-Gate nutzen. */
export function useAdminAuth(): {
  state: AdminAuthState;
  token: string | null;
  error: string | null;
  resetToken: () => void;
} {
  const [state, setState] = useState<AdminAuthState>("checking");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) {
      setState("missing");
      return;
    }
    setToken(t);
    checkAdminToken(t).then(result => {
      if (result.ok) {
        setState("ok");
      } else {
        setError(result.error ?? "Auth fehlgeschlagen");
        if (result.error?.includes("nicht konfiguriert")) setState("not-configured");
        else setState("invalid");
      }
    });
  }, []);

  const resetToken = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.location.reload();
    }
  };

  return { state, token, error, resetToken };
}

/** Generischer Caller für /api/admin/{path} mit Bearer-Auth. */
export async function callAdminAction(
  action: "curate" | "delete",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const t = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!t) return { ok: false, error: "Token fehlt" };
  try {
    const res = await fetch(`/api/admin/${action}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? `${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
