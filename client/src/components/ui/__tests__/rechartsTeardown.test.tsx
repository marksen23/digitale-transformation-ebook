/** @vitest-environment happy-dom */
/**
 * Regressionstest für den CI-Flake "ReferenceError: window is not defined"
 * (#77): Nach dem letzten Test darf keine Komponente mehr Arbeit planen.
 *
 * Simuliert den Abbau der happy-dom-Umgebung: `window` wird entfernt und
 * 200 ms gewartet. Ohne das globale afterEach(cleanup) aus
 * client/src/test/setup.ts läuft recharts' Animationsschleife weiter, ruft
 * setState auf und React wirft deterministisch einen Unhandled Error.
 *
 * Bis 2026-11-20 lief der Test an der Enkidu-ResonanzChart. Die fiel mit dem
 * „Nachklang“-Fragebogen weg; der Wächter bleibt mit einem schlichten
 * recharts-Diagramm, denn recharts (components/ui/chart.tsx) bleibt im Projekt.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

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

const points = [
  { x: "a", y: 0.5, z: 0 },
  { x: "b", y: 1, z: 1 },
];

describe("recharts – Abbau", () => {
  it("rendert mit laufender Animation", () => {
    const { container } = render(
      <div style={{ width: 480, height: 200 }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={points}>
            <Line type="monotone" dataKey="y" />
            <Line type="monotone" dataKey="z" />
          </LineChart>
        </ResponsiveContainer>
      </div>,
    );
    expect(container.querySelectorAll(".recharts-line")).toHaveLength(2);
  });
});
