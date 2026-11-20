/** @vitest-environment happy-dom */
/**
 * Regressionstest für den CI-Flake "ReferenceError: window is not defined"
 * (#77): Nach dem letzten Test darf keine Komponente mehr Arbeit planen.
 *
 * Simuliert den Abbau der happy-dom-Umgebung: `window` wird entfernt und
 * 200 ms gewartet. Ohne das globale afterEach(cleanup) aus
 * client/src/test/setup.ts läuft recharts' Animationsschleife weiter, ruft
 * setState auf und React wirft deterministisch einen Unhandled Error.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/react";
import ResonanzChart from "../ResonanzChart.js";
import type { ResonanzPunkt } from "@/lib/extractKeywords";

beforeAll(() => {
  class FakeResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      this.cb(
        [
          {
            target,
            contentRect: { width: 480, height: 200, x: 0, y: 0, top: 0, left: 0, bottom: 200, right: 480, toJSON() { return {}; } },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterAll(async () => {
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  delete g.window;
  try {
    await new Promise((resolve) => setTimeout(resolve, 200));
  } finally {
    g.window = saved;
  }
});

const points: ResonanzPunkt[] = [
  { label: "1.1\n#1", date: "2026-01-01", q1: 1, q2: 0.5, q3: 0, avg: 0.5 },
  { label: "2.1\n#2", date: "2026-01-02", q1: 1, q2: 1, q3: 1, avg: 1 },
];

describe("ResonanzChart – Abbau", () => {
  it("rendert mit laufender Animation", () => {
    const { container } = render(<ResonanzChart data={points} />);
    expect(container.querySelectorAll(".recharts-line")).toHaveLength(4);
  });
});
