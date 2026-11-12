/**
 * Öffentliche Erkenntnisse: bestätigte und automatisch veröffentlichte Kernsätze
 * plus automatisch veröffentlichte Master-Synthesen.
 */
import type { Erkenntnis } from "./erkenntnisse";
import type { ResonanzEntry } from "./resonanzenIndex";

export interface FeedItem {
  id: string;
  kind: "kernsatz" | "master";
  text: string;
  questionSourceId: string;
  answerId: string;
  conceptAnchor: string | null;
  distinctness: number | null;
  createdAt: string;
  auto: boolean;
}

/** Erster Absatz der Synthese, gekürzt, als Zeile auf der Seite. */
export function synthesisLead(response: string): string {
  const stripped = response.replace(/^##\s+Synthese\s*/i, "").trim();
  const para = (stripped.split(/\n\s*\n/)[0] ?? "").replace(/\s+/g, " ").trim();
  if (para.length <= 320) return para;
  return para.slice(0, 317).replace(/\s+\S*$/, "") + "…";
}

export function buildErkenntnisFeed(erk: Erkenntnis[], entries: ResonanzEntry[]): FeedItem[] {
  const kern: FeedItem[] = erk.map(e => ({
    id: e.id,
    kind: "kernsatz",
    text: e.kernsatz,
    questionSourceId: e.questionSourceId,
    answerId: e.answerId,
    conceptAnchor: e.conceptAnchor,
    distinctness: e.distinctness,
    createdAt: e.createdAt,
    auto: e.actor === "auto",
  }));
  const masters: FeedItem[] = entries
    .filter(e => e.is_master && e.status === "published" && e.autoPublished)
    .map(e => ({
      id: e.id,
      kind: "master" as const,
      text: synthesisLead(e.response),
      questionSourceId: e.master_of?.[0] ?? "",
      answerId: e.id,
      conceptAnchor: e.conceptAnchor ?? null,
      distinctness: null,
      createdAt: e.ts,
      auto: true,
    }));
  return [...kern, ...masters].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
