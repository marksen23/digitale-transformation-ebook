import { describe, it, expect } from "vitest";
import { analyseGraph, buildAdjacency, findComponents, pairKey, type TaggedEdge } from "../lib/concept-graph-utils.js";

const e = (source: string, target: string, layer = "EDGES"): TaggedEdge => ({ source, target, layer });

describe("pairKey", () => {
  it("ist richtungsunabhängig", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
  it("unterscheidet verschiedene Paare", () => {
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });
});

describe("buildAdjacency", () => {
  it("trägt jede Kante in beide Richtungen ein", () => {
    const adj = buildAdjacency(["a", "b"], [e("a", "b")]);
    expect(adj.get("a")).toEqual(new Set(["b"]));
    expect(adj.get("b")).toEqual(new Set(["a"]));
  });
  it("überspringt Kanten auf unbekannte Knoten, statt sie anzulegen", () => {
    const adj = buildAdjacency(["a"], [e("a", "ghost")]);
    expect(adj.has("ghost")).toBe(false);
    expect(adj.get("a")).toEqual(new Set(["ghost"]));
  });
});

describe("findComponents", () => {
  it("findet eine Komponente im verbundenen Netz", () => {
    const comps = findComponents(buildAdjacency(["a", "b", "c"], [e("a", "b"), e("b", "c")]));
    expect(comps).toHaveLength(1);
    expect(comps[0].size).toBe(3);
  });
  it("trennt zwei Inseln und sortiert die größere nach vorn", () => {
    const comps = findComponents(buildAdjacency(["a", "b", "c", "d", "e"], [e("a", "b"), e("c", "d"), e("d", "e")]));
    expect(comps.map(c => c.size)).toEqual([3, 2]);
    expect(comps[0].nodeIds).toEqual(["c", "d", "e"]);
  });
  it("ist stabil sortiert bei gleich großen Komponenten", () => {
    const adj = buildAdjacency(["x", "y", "a", "b"], [e("x", "y"), e("a", "b")]);
    expect(findComponents(adj).map(c => c.nodeIds[0])).toEqual(["a", "x"]);
  });
});

describe("analyseGraph — sauberes Netz", () => {
  it("meldet ok ohne Befunde", () => {
    const r = analyseGraph(["a", "b", "c"], [e("a", "b"), e("b", "c")]);
    expect(r.status).toBe("ok");
    expect(r.issues).toHaveLength(0);
    expect(r.totals.unreachableFromMain).toBe(0);
  });
});

describe("analyseGraph — Alarme", () => {
  it("erkennt eine Kante auf einen unbekannten Knoten", () => {
    const r = analyseGraph(["a"], [e("a", "ghost")]);
    expect(r.status).toBe("alarm");
    expect(r.totals.danglingEdges).toBe(1);
    expect(r.issues.find(i => i.rule === "dangling-edge")?.detail).toContain("ghost");
  });
  it("erkennt eine Dublette innerhalb derselben Schicht, auch umgedreht notiert", () => {
    const r = analyseGraph(["a", "b"], [e("a", "b"), e("b", "a")]);
    expect(r.status).toBe("alarm");
    expect(r.issues.filter(i => i.rule === "duplicate-edge")).toHaveLength(1);
  });
  it("erkennt eine Kante auf sich selbst", () => {
    const r = analyseGraph(["a"], [e("a", "a")]);
    expect(r.status).toBe("alarm");
    expect(r.issues[0].rule).toBe("self-loop");
  });
});

describe("analyseGraph — Warnungen", () => {
  it("meldet einen Knoten ohne jede Kante, ohne Alarm zu schlagen", () => {
    const r = analyseGraph(["a", "b", "einsam"], [e("a", "b")]);
    expect(r.status).toBe("warning");
    expect(r.isolatedNodes).toEqual(["einsam"]);
    expect(r.issues.some(i => i.rule === "detached-component")).toBe(false);
  });
  it("meldet eine abgetrennte Komponente", () => {
    const r = analyseGraph(["a", "b", "c", "x", "y"], [e("a", "b"), e("b", "c"), e("x", "y")]);
    expect(r.status).toBe("warning");
    expect(r.totals.unreachableFromMain).toBe(2);
    expect(r.detachedComponents[0].nodeIds).toEqual(["x", "y"]);
  });
  it("meldet eine gewachsene Kante, die eine statische wiederholt — als Warnung, nicht als Alarm", () => {
    const r = analyseGraph(["a", "b"], [e("a", "b", "EDGES"), e("b", "a", "concept-edges.json")]);
    expect(r.status).toBe("warning");
    expect(r.totals.redundantPromotedEdges).toBe(1);
  });
});

describe("analyseGraph — Vorrang", () => {
  it("lässt einen Alarm die Warnungen überstimmen", () => {
    const r = analyseGraph(["a", "b", "einsam"], [e("a", "b"), e("a", "ghost")]);
    expect(r.status).toBe("alarm");
    expect(r.issues.some(i => i.level === "warning")).toBe(true);
  });
});
