/** @vitest-environment happy-dom */
import { describe, expect, it, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import ResonanzChart from "../ResonanzChart.js";
import type { ResonanzPunkt } from "@/lib/extractKeywords";

beforeAll(() => {
  // recharts misst über ResizeObserver. happy-dom hat keinen.
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

const points: ResonanzPunkt[] = [
  { label: "1.1\n#1", date: "2026-01-01", q1: 1, q2: 0.5, q3: 0, avg: 0.5 },
  { label: "2.1\n#2", date: "2026-01-02", q1: 1, q2: 1, q3: 1, avg: 1 },
];

describe("ResonanzChart", () => {
  it("zeichnet vier Linien, sobald zwei Punkte da sind", () => {
    const { container } = render(<ResonanzChart data={points} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll(".recharts-line")).toHaveLength(4);
  });

  it("zeigt den Leerzustand ohne Verlauf", () => {
    const { container } = render(<ResonanzChart data={[]} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("Noch keine abgeschlossenen Gespräche");
  });
});
