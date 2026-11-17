/**
 * concept-graph-utils.ts — reine Topologie-Analyse des Begriffsnetzes.
 *
 * Ohne IO, damit testbar (Muster wie corpus-drift-utils.ts). Das Script
 * check-concept-graph.ts lädt die Schichten und schreibt den Report; hier
 * steht nur die Rechnung.
 *
 * Das Netz wird **ungerichtet** ausgewertet, exakt wie ConceptGraphPage den
 * ADJACENCY-Index baut (jede Kante in beide Richtungen). `source`/`target`
 * sind Schreibkonvention, keine Semantik.
 */

export type Level = "alarm" | "warning";

export interface Issue {
  level: Level;
  rule: string;
  detail: string;
}

/** Kante mit Herkunftsschicht, damit Duplikate benennbar bleiben. */
export interface TaggedEdge {
  source: string;
  target: string;
  layer: string;
}

export interface Component {
  size: number;
  nodeIds: string[];
}

export interface GraphAnalysis {
  status: "ok" | "warning" | "alarm";
  totals: {
    nodes: number;
    edges: number;
    components: number;
    isolatedNodes: number;
    reachableFromMain: number;
    unreachableFromMain: number;
    danglingEdges: number;
    redundantPromotedEdges: number;
  };
  mainComponentSize: number;
  detachedComponents: Component[];
  isolatedNodes: string[];
  issues: Issue[];
}

/** Richtungsunabhängiger Schlüssel für ein Knotenpaar. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Baut die ungerichtete Adjazenz. Kanten auf unbekannte Knoten werden
 * übersprungen — sie sind separat als `dangling-edge` gemeldet.
 */
export function buildAdjacency(nodeIds: Iterable<string>, edges: TaggedEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const id of nodeIds) adjacency.set(id, new Set());
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  return adjacency;
}

/** Zusammenhangskomponenten per BFS, absteigend nach Größe. */
export function findComponents(adjacency: Map<string, Set<string>>): Component[] {
  const visited = new Set<string>();
  const components: Component[] = [];
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const group: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
    components.push({ size: group.length, nodeIds: group.sort() });
  }
  // Nach Größe, bei Gleichstand alphabetisch — damit der Report stabil bleibt
  // und ein Rebuild ohne Änderung keinen Diff erzeugt.
  components.sort((a, b) => b.size - a.size || a.nodeIds[0].localeCompare(b.nodeIds[0]));
  return components;
}

/**
 * Severity-Design:
 *   alarm   — eindeutiger Datenfehler (Kante ins Leere, Dublette, Selbstbezug)
 *   warning — inhaltliche Entscheidung (Isolation, abgetrennte Komponente,
 *             gewachsene Kante, die eine statische wiederholt)
 *
 * Isolation ist bewusst kein Alarm: ob ein Begriff angebunden gehört, ist
 * Begriffsarbeit, kein Bug.
 */
export function analyseGraph(nodeIdList: Iterable<string>, edges: TaggedEdge[]): GraphAnalysis {
  const nodeIds = new Set(nodeIdList);
  const issues: Issue[] = [];

  // 1. Kanten ins Leere
  const dangling = edges.filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target));
  for (const edge of dangling) {
    const missing = [edge.source, edge.target].filter(id => !nodeIds.has(id));
    issues.push({
      level: "alarm",
      rule: "dangling-edge",
      detail: `${edge.layer}: ${edge.source} → ${edge.target} — unbekannter Knoten: ${missing.join(", ")}`,
    });
  }

  // 2. Selbstbezug + Dubletten
  const seen = new Map<string, TaggedEdge>();
  let redundantPromoted = 0;
  for (const edge of edges) {
    if (edge.source === edge.target) {
      issues.push({ level: "alarm", rule: "self-loop", detail: `${edge.layer}: ${edge.source} → sich selbst` });
      continue;
    }
    const key = pairKey(edge.source, edge.target);
    const first = seen.get(key);
    if (!first) {
      seen.set(key, edge);
      continue;
    }
    if (first.layer === edge.layer) {
      issues.push({
        level: "alarm",
        rule: "duplicate-edge",
        detail: `${edge.layer}: ${edge.source} ↔ ${edge.target} steht doppelt in derselben Liste`,
      });
    } else {
      redundantPromoted++;
      issues.push({
        level: "warning",
        rule: "redundant-promoted-edge",
        detail: `${edge.source} ↔ ${edge.target}: in ${edge.layer} erhoben, existiert aber bereits in ${first.layer}`,
      });
    }
  }

  // 3. Topologie
  const adjacency = buildAdjacency(nodeIds, edges);
  const components = findComponents(adjacency);
  const mainComponent = components[0] ?? { size: 0, nodeIds: [] };
  const detached = components.slice(1);

  const isolated = [...nodeIds].filter(id => (adjacency.get(id)?.size ?? 0) === 0).sort();
  for (const id of isolated) {
    issues.push({
      level: "warning",
      rule: "isolated-node",
      detail: `${id} hat keine einzige Kante — im Netz nicht erreichbar`,
    });
  }

  for (const component of detached) {
    // Einzelgänger sind bereits als isolated-node gemeldet
    if (component.size === 1) continue;
    issues.push({
      level: "warning",
      rule: "detached-component",
      detail: `${component.size} Knoten hängen nur untereinander zusammen: ${component.nodeIds.join(", ")}`,
    });
  }

  const hasAlarm = issues.some(i => i.level === "alarm");
  const hasWarning = issues.some(i => i.level === "warning");

  return {
    status: hasAlarm ? "alarm" : hasWarning ? "warning" : "ok",
    totals: {
      nodes: nodeIds.size,
      edges: edges.length,
      components: components.length,
      isolatedNodes: isolated.length,
      reachableFromMain: mainComponent.size,
      unreachableFromMain: nodeIds.size - mainComponent.size,
      danglingEdges: dangling.length,
      redundantPromotedEdges: redundantPromoted,
    },
    mainComponentSize: mainComponent.size,
    detachedComponents: detached,
    isolatedNodes: isolated,
    issues,
  };
}
