/**
 * MobileStatTile — the value/label stat box repeated across Mein Werk,
 * Betrieb-Metrics and Betrieb-Status (Cormorant-Garamond value, tracked
 * Courier-Prime label underneath).
 */
import { MONO, type Palette } from "@/lib/theme";

export default function MobileStatTile({
  value, label, color, C,
}: {
  value: string; label: string; color?: string; C: Palette;
}) {
  return (
    <div style={{ background: C.deep, padding: "11px 12px" }}>
      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 26, lineHeight: 1.1, color: color ?? C.accentText, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}
