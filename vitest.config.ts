import { defineConfig } from "vitest/config";

// Eigene Vitest-Config (überschreibt vite.config.ts, dessen root=client/ die
// Tests unter scripts/ + server/ unsichtbar machte). Reine Unit-Tests für
// pure Funktionen — node-Umgebung, keine Vite-Plugins nötig.
export default defineConfig({
  test: {
    root: ".",
    environment: "node",
    include: [
      "scripts/**/*.test.ts",
      "server/**/*.test.ts",
      "client/src/**/*.test.{ts,tsx}",
    ],
  },
});
