export interface DriftIssue {
  level: "warning" | "alarm";
  rule: string;
  detail: string;
}

export interface DriftSnapshot {
  filesChecked: number;
  aggregates: {
    byEndpoint: Record<string, number>;
    byStatus: Record<string, number>;
  };
}

export function compareCounts(label: string, before: Record<string, number>, after: Record<string, number>): DriftIssue[] {
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

export function detectDrift(prev: DriftSnapshot, curr: DriftSnapshot): DriftIssue[] {
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
      detail: `published-Einträge geschrumpft: ${prevPub} → ${currPub}`,
    });
  }

  return issues;
}
