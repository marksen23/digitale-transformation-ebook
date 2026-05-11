import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import type { ResonanzPunkt } from "@/lib/extractKeywords";

interface ResonanzChartProps {
  data: ResonanzPunkt[];
}

const C = {
  void: "#080808",
  surface: "#161616",
  border: "#2a2a2a",
  muted: "#444",
  textDim: "#888",
  text: "#c8c2b4",
  accent: "#f59e0b",
  accentDim: "#b45309",
  serif: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'Courier Prime', 'Courier New', monospace",
} as const;

// Custom tooltip
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const names: Record<string, string> = {
    avg: "Resonanz",
    q1: "Überraschung",
    q2: "Innehalten",
    q3: "Mitgenommen",
  };
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      padding: "0.75rem 1rem", fontFamily: C.mono, fontSize: "0.7rem",
      letterSpacing: "0.05em", color: C.text,
    }}>
      <div style={{ color: C.textDim, marginBottom: "0.4rem" }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: "0.2rem" }}>
          {names[p.name] ?? p.name}: {(p.value * 100).toFixed(0)}%
        </div>
      ))}
    </div>
  );
}

export default function ResonanzChart({ data }: ResonanzChartProps) {
  if (data.length < 2) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: C.mono, fontSize: "0.7rem", letterSpacing: "0.1em" }}>
        {data.length === 0
          ? "Noch keine abgeschlossenen Gespräche"
          : "Mindestens 2 Gespräche für den Verlauf erforderlich"}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, left: -20, bottom: 8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={C.border}
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontFamily: C.mono, fontSize: 10, fill: C.textDim }}
          axisLine={{ stroke: C.border }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.5, 1]}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          tick={{ fontFamily: C.mono, fontSize: 10, fill: C.textDim }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        {/* Sub-lines: individual questions (subtle, dashed) */}
        <Line
          type="monotone" dataKey="q1" name="q1"
          stroke={C.accentDim} strokeWidth={1}
          strokeDasharray="3 4" dot={false} activeDot={false}
        />
        <Line
          type="monotone" dataKey="q2" name="q2"
          stroke="#6a5a44" strokeWidth={1}
          strokeDasharray="3 4" dot={false} activeDot={false}
        />
        <Line
          type="monotone" dataKey="q3" name="q3"
          stroke="#8a7a62" strokeWidth={1}
          strokeDasharray="3 4" dot={false} activeDot={false}
        />
        {/* Main resonance line — amber, prominent */}
        <Line
          type="monotone" dataKey="avg" name="avg"
          stroke={C.accent} strokeWidth={2}
          dot={{ fill: C.accent, r: 3, strokeWidth: 0 }}
          activeDot={{ fill: C.accent, r: 5, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
