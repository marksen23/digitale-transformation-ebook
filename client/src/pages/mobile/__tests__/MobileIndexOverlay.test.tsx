/** @vitest-environment happy-dom */
/**
 * Der mobile Inhalt (Cover → „Inhalt“) muss Enkidu anbieten — derselbe
 * Eintrag wie in siteNav / AppFrame. Ohne /enkidu-Route und ohne diesen
 * Listenplatz war die Begegnung auf dem Telefon unerreichbar.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MobileIndexOverlay from "@/pages/mobile/MobileIndexOverlay";
import { C_LIGHT } from "@/lib/theme";

vi.mock("@/lib/resonanzenIndex", () => ({
  loadResonanzenIndexLazy: async () => ({ count: 12 }),
}));
vi.mock("@/lib/questions", () => ({
  loadQuestions: async () => ({ questions: [] }),
  questionCounts: () => ({ open: 3, answered: 0, total: 3, followUp: 0, followUpOpen: 0 }),
}));
vi.mock("@/lib/erkenntnisse", () => ({
  loadErkenntnisse: async () => [{}, {}],
}));
vi.mock("@/lib/readingProgress", () => ({
  getCompletedChapters: () => [],
}));

describe("MobileIndexOverlay", () => {
  it("lists Enkidu under Mitdenken and navigates to /enkidu", () => {
    const navigate = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileIndexOverlay
        C={C_LIGHT}
        tocChapters={[]}
        navigate={navigate}
        onClose={onClose}
        onSearch={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /Enkidu/ });
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/enkidu");
  });
});
