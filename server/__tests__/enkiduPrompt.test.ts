import { describe, it, expect } from "vitest";
import { ENKIDU_SYSTEM_PROMPT } from "../routes/enkidu.js";

describe("ENKIDU_SYSTEM_PROMPT", () => {
  // Bis 2026-11-20 verlangte der Prompt eine Abschlussformel („Nach diesem
  // Gespräch warten drei kurze Fragen auf dich …“). Gemini hängte sie an jede
  // Antwort, sie landete in 55 Korpus-Texten. Sie darf nicht zurückkehren.
  it("enthält keine Abschlussformel und keinen Verweis auf drei Fragen", () => {
    expect(ENKIDU_SYSTEM_PROMPT).not.toMatch(/GESPRÄCHSABSCHLUSS/);
    expect(ENKIDU_SYSTEM_PROMPT).not.toMatch(/drei\s+(kurze\s+)?Fragen/i);
    expect(ENKIDU_SYSTEM_PROMPT).not.toMatch(/nicht über mich, sondern über dich/i);
  });

  it("behält die Kernanweisungen", () => {
    expect(ENKIDU_SYSTEM_PROMPT).toMatch(/^Du bist Enkidu\./);
    expect(ENKIDU_SYSTEM_PROMPT).toContain("ABSOLUTE VERBOTE");
    expect(ENKIDU_SYSTEM_PROMPT).toContain("VETO-MECHANISMEN");
  });
});
