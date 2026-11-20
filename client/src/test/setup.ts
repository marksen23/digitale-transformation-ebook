/**
 * Globales Vitest-Setup (vitest.config.ts → test.setupFiles).
 *
 * Warum: Vitest läuft hier ohne `globals: true`. Dann registriert
 * @testing-library/react sein automatisches `afterEach(cleanup)` NICHT –
 * gerenderte Komponenten bleiben nach dem Test gemountet. Laufende
 * Animationen (z. B. recharts' requestAnimationFrame-Schleife) rufen dann
 * weiter setState auf, und React plant Arbeit über den Scheduler
 * (setImmediate). Fällt so ein Callback in den Abbau der happy-dom-
 * Umgebung, wirft React "ReferenceError: window is not defined" als
 * Unhandled Error – der Lauf wird rot, obwohl alle Tests grün sind
 * (Flake in CI auf #77).
 *
 * Fix: in DOM-Umgebungen nach jedem Test unmounten (stoppt Animationen,
 * Timer, Effekte) und einen Makrotask abwarten, damit bereits geplante
 * Scheduler-Callbacks noch MIT window laufen.
 */
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof window === "undefined") return; // node-Umgebung: nichts zu tun
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});
