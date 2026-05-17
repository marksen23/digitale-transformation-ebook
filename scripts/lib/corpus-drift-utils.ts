/**
 * Pure utility functions for corpus drift detection.
 * Extracted from check-corpus-drift.ts for testability.
 */

export interface Snapshot {
  date: string;
  generatedAt: string;
  commit: string;
  filesChecked: number;
  aggregates: {
    byEndpoint: Record<string, number>;
    byStatus: Record<string, number>;
    orphanNodeIds: string[];
  };
  errors: number;
  warnings: number;
}

export interface DriftIssue {
  level: "warning" | "alarm";
  rule: string;
  detail: string;
}

/**
 * Compares two count maps and flags keys that shrank by >30%.
 * >50% shrink → alarm, 30–50% → warning. Growth is never flagged.
 */
export function compareCounts(
  label: string,
  before: Record<string, number>,
  after: Record<string, number>,
): DriftIssue[] {
  const issues: DriftIssue[] = [];
  for (const key of Object.keys(before)) {
    const b = before[key], a = after[key] ?? 0;
    const delta = a - b;
    const ratio = b > 0 ? Math.abs(delta) / b : 0;
    if (delta < 0 && ratio > 0.3) {
      issues.push({
        level: ratio > 0.5 ? "alarm" : "warning",
        rule: `${label}-shrink`,
        detail: `${key}: ${b} → ${a} (-${Math.abs(delta)}, ${(ratio * 100).toFixed(0)}%)`,
      });
    }
  }
  return issues;
}

/**
 * Compares two consecutive snapshots and returns any drift issues found.
 * Rules:
 *   1. filesChecked shrinks by >2 → warning (>5% of prev → alarm)
 *   2. Any endpoint shrinks by >30% → warning/alarm
 *   3. published count ever decreases → immediate alarm
 *   4. Any status shrinks by >30% → warning/alarm
 */
export function detectDrift(prev: Snapshot, curr: Snapshot): DriftIssue[] {
  const issues: DriftIssue[] = [];

  const fileDelta = curr.filesChecked - prev.filesChecked;
  if (fileDelta < -2) {
    const ratio = prev.filesChecked > 0 ? Math.abs(fileDelta) / prev.filesChecked : 0;
    issues.push({
      level: ratio > 0.05 ? "alarm" : "warning",
      rule: "files-shrink",
      detail: `filesChecked: ${prev.filesChecked} → ${curr.filesChecked} (${fileDelta})`,
    });
  }

  issues.push(...compareCounts("endpoint", prev.aggregates.byEndpoint, curr.aggregates.byEndpoint));

  const prevPub = prev.aggregates.byStatus.published ?? 0;
  const currPub = curr.aggregates.byStatus.published ?? 0;
  if (currPub < prevPub) {
    issues.push({
      level: "alarm",
      rule: "published-shrink",
      detail: `published-Einträge geschrumpft: ${prevPub} → ${currPub} — kuratiertes Korpus sollte nie kleiner werden`,
    });
  }
  issues.push(...compareCounts("status", prev.aggregates.byStatus, curr.aggregates.byStatus));

  return issues;
}
