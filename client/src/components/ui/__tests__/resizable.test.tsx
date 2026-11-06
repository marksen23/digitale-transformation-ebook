/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../resizable.js";

describe("Resizable-Panels", () => {
  it("stapelt eine vertikale Gruppe und legt den Separator quer", () => {
    const { container } = render(
      <div style={{ width: 320, height: 240 }}>
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel id="oben" defaultSize="60%">
            Oben
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="unten" defaultSize="40%">
            Unten
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    const group = container.querySelector("[data-slot=resizable-panel-group]");
    expect(group?.getAttribute("data-group")).not.toBeNull();
    expect(group?.getAttribute("style") ?? "").toContain("column");
    expect(container.querySelector("[data-slot=resizable-panel]")).not.toBeNull();

    const handle = container.querySelector("[data-slot=resizable-handle]");
    expect(handle?.getAttribute("role")).toBe("separator");
    // Vertikale Gruppe → der Griff ist eine waagerechte Leiste.
    expect(handle?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(container.textContent).toContain("Oben");
    expect(container.textContent).toContain("Unten");
  });
});
