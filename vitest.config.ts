import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Die App-Vite-Config (Plugin React, JSX automatic) gilt hier nicht.
  // Ohne das kompiliert esbuild TSX zu React.createElement und Komponenten-
  // Tests scheitern mit "React is not defined".
  esbuild: {
    jsx: "automatic",
  },
  test: {
    root: ".",
    environment: "node",
    include: [
      "client/src/lib/__tests__/**/*.test.ts",
      "client/src/hooks/__tests__/**/*.test.{ts,tsx}",
      "client/src/components/**/__tests__/**/*.test.tsx",
      "scripts/__tests__/**/*.test.ts",
      "server/__tests__/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
