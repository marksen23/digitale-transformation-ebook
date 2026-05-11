import { useMemo } from "react";
import type { KeywordEntry } from "@/lib/extractKeywords";

interface WordCloudProps {
  keywords: KeywordEntry[];
  width?: number;
  height?: number;
  /** Optional: macht Wörter klickbar (z.B. für Such-Aktivierung). */
  onWordClick?: (word: string) => void;
}

interface PlacedWord {
  word: string;
  score: number;
  fontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

// Color palette from C constants — amber-sand spectrum
const COLORS = [
  "#f59e0b", // accent
  "#a8906c",
  "#d4b896",
  "#b45309", // accentDim
  "#e8d4b8",
  "#b89870",
  "#6a5a44",
  "#c8b888",
];

function getFontSize(score: number, minScore: number, maxScore: number): number {
  if (maxScore === minScore) return 18;
  const t = (score - minScore) / (maxScore - minScore);
  // Range: 11px (min) to 34px (max)
  return Math.round(11 + t * 23);
}

// Estimate text bounding box (SVG text metrics approximation)
function estimateBox(word: string, fontSize: number): { w: number; h: number } {
  const charWidth = fontSize * 0.58; // approximate
  return { w: Math.ceil(word.length * charWidth) + 4, h: Math.ceil(fontSize * 1.2) };
}

// Pre-compute spiral positions (Archimedean spiral) as a flat array
function buildSpiral(cx: number, cy: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const step = 0.18;
  let angle = 0;
  while (angle < 200) {
    const r = 2.5 * angle;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    angle += step;
  }
  return pts;
}

// AABB overlap check with padding
function overlaps(a: PlacedWord, bx: number, by: number, bw: number, bh: number, pad = 4): boolean {
  return !(
    bx + bw + pad < a.x ||
    bx - pad > a.x + a.width ||
    by + bh + pad < a.y ||
    by - pad > a.y + a.height
  );
}

function placeWords(
  keywords: KeywordEntry[],
  svgW: number,
  svgH: number
): PlacedWord[] {
  if (keywords.length === 0) return [];

  const scores = keywords.map(k => k.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  const placed: PlacedWord[] = [];
  const cx = svgW / 2;
  const cy = svgH / 2;
  const spiral = buildSpiral(cx, cy);

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const fontSize = getFontSize(kw.score, minScore, maxScore);
    const { w, h } = estimateBox(kw.word, fontSize);
    const color = COLORS[i % COLORS.length];

    for (let s = 0; s < spiral.length; s++) {
      const [px, py] = spiral[s];
      const x = px - w / 2;
      const y = py - h / 2;

      // Stay within canvas bounds (with margin)
      if (x < 4 || x + w > svgW - 4 || y < 4 || y + h > svgH - 4) continue;

      // Check collision with already placed words
      const collision = placed.some(p => overlaps(p, x, y, w, h));
      if (!collision) {
        placed.push({ word: kw.word, score: kw.score, fontSize, x, y, width: w, height: h, color });
        break;
      }
    }
  }

  return placed;
}

export default function WordCloud({ keywords, width = 540, height = 280, onWordClick }: WordCloudProps) {
  const placed = useMemo(
    () => placeWords(keywords, width, height),
    [keywords, width, height]
  );

  if (keywords.length === 0) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontFamily: "'Courier Prime', monospace", fontSize: "0.75rem", letterSpacing: "0.1em" }}>
        Noch keine Gespräche analysiert
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, display: "block", margin: "0 auto", overflow: "visible" }}
      aria-label="Wort-Wolke der häufigsten Begriffe"
    >
      {placed.map((pw) => (
        <text
          key={pw.word}
          x={pw.x + pw.width / 2}
          y={pw.y + pw.height * 0.78}
          textAnchor="middle"
          fontSize={pw.fontSize}
          fill={pw.color}
          fontFamily="'Lora', Georgia, serif"
          style={{
            userSelect: "none",
            transition: "opacity 0.2s",
            cursor: onWordClick ? "pointer" : "default",
          }}
          opacity={0.85}
          onClick={onWordClick ? () => onWordClick(pw.word) : undefined}
          onMouseEnter={onWordClick ? (e) => (e.currentTarget.setAttribute("opacity", "1")) : undefined}
          onMouseLeave={onWordClick ? (e) => (e.currentTarget.setAttribute("opacity", "0.85")) : undefined}
        >
          {pw.word}
        </text>
      ))}
    </svg>
  );
}
