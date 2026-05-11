import type { ThemenEntry } from "@/lib/extractKeywords";

interface ThemenBalanceProps {
  data: ThemenEntry[];
}

const C = {
  surface: "#161616",
  border: "#2a2a2a",
  muted: "#444",
  textDim: "#888",
  text: "#c8c2b4",
  accent: "#f59e0b",
  accentDim: "#b45309",
  mono: "'Courier Prime', 'Courier New', monospace",
  serif: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
} as const;

export default function ThemenBalance({ data }: ThemenBalanceProps) {
  if (data.length === 0) {
    return (
      <div style={{ color: C.muted, fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.1em", padding: "1.5rem 0" }}>
        Noch keine Themendaten
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      {data.map((entry, i) => {
        const pct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
        // Gradient intensity based on rank
        const opacity = 0.4 + (1 - i / data.length) * 0.6;

        return (
          <div key={entry.term}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem" }}>
              <span style={{ fontFamily: C.serif, fontSize: "0.95rem", color: C.text, fontStyle: "italic" }}>
                {entry.displayLabel}
              </span>
              <span style={{ fontFamily: C.mono, fontSize: "0.65rem", color: C.textDim, letterSpacing: "0.08em" }}>
                {entry.count}×
              </span>
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: `linear-gradient(to right, ${C.accentDim}, ${C.accent})`,
                  opacity,
                  borderRadius: 2,
                  transition: "width 0.8s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
