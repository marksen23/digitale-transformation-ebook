/**
 * Umami-Snippet für index.html.
 *
 * Vite ersetzt `%VITE_…%` in HTML nur, wenn die Variable gesetzt ist. Ohne
 * beide Werte bliebe sonst `src="%VITE_ANALYTICS_ENDPOINT%/umami"` stehen
 * und der Browser fordert eine kaputte URL an (HTTP 400). Deshalb wird das
 * Script nur injiziert, wenn Endpoint UND Website-ID echte Werte sind.
 */

export interface UmamiScript {
  src: string;
  websiteId: string;
}

export function umamiScript(
  endpoint: string | undefined,
  websiteId: string | undefined,
): UmamiScript | null {
  const ep = (endpoint ?? "").trim().replace(/\/+$/, "");
  const id = (websiteId ?? "").trim();
  if (!ep || !id) return null;
  // Ungesetzte Vite-Platzhalter und Attribut-/URL-Brüche nicht durchlassen.
  if (ep.includes("%") || id.includes("%")) return null;
  if (/[\s"'<>]/.test(ep) || /[\s"'<>]/.test(id)) return null;
  if (!/^https?:\/\//i.test(ep)) return null;
  return { src: `${ep}/umami`, websiteId: id };
}
