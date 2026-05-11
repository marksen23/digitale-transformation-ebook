/**
 * Skeleton — Placeholder-Block, der eine pulsierende Animation zeigt,
 * während Daten laden. Ersetzt 'lädt …'-Italic auf den Sub-Pages.
 *
 * Theme-aware via useEbookTheme. Respektiert prefers-reduced-motion.
 */
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { RADIUS } from "@/lib/theme";

interface SkeletonProps {
  /** Höhe in px oder rem; default: '1em' (passt zu Text-Zeilen). */
  height?: number | string;
  /** Breite: Pixel, rem, % oder 'auto'; default: '100%'. */
  width?: number | string;
  /** Mehrere Zeilen übereinander gerendert. */
  lines?: number;
  /** Eigene Abstandsangabe (z.B. marginBottom für Gruppen). */
  style?: React.CSSProperties;
  /** Etwas dezenter (für Hintergrund-Slots). */
  subtle?: boolean;
}

export default function Skeleton({ height = "1em", width = "100%", lines, style, subtle }: SkeletonProps) {
  const isDark = useEbookTheme();
  const bg = isDark
    ? (subtle ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)")
    : (subtle ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.07)");
  const bgHi = isDark
    ? "rgba(255,255,255,0.14)"
    : "rgba(0,0,0,0.12)";

  if (lines && lines > 1) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4em", ...style }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            height={height}
            width={i === lines - 1 ? "75%" : width}
            subtle={subtle}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="lädt …"
      style={{
        display: "inline-block",
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        background: `linear-gradient(90deg, ${bg} 0%, ${bgHi} 50%, ${bg} 100%)`,
        backgroundSize: "200% 100%",
        borderRadius: RADIUS.button,
        animation: "skeleton-pulse 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
