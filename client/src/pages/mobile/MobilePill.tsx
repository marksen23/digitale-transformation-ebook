/**
 * MobilePill — the filter/tab chip used across the mobile Werkzeug screens
 * (Fragen status filter, Betrieb tab strip, Landkarte-adjacent chips):
 * 44px tap target, amber outline + tint when active. Matches the prototype's
 * shared `pill()` helper.
 */
import { MONO, type Palette } from "@/lib/theme";

export default function MobilePill({
  label, active, onClick, C, dashed = false,
}: {
  label: string; active: boolean; onClick: () => void; C: Palette; dashed?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        minHeight: 44, padding: "0 12px", flexShrink: 0, cursor: "pointer",
        borderRadius: 4,
        border: `1px ${dashed ? "dashed" : "solid"} ${active ? C.accentText : C.border}`,
        background: active ? `${C.accent}1a` : "transparent",
        color: active ? C.accentText : C.textDim,
        fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
      }}
    >{label}</button>
  );
}
