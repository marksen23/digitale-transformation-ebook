#!/usr/bin/env bash
#
# netlify-ignore.sh — Netlify Build-Ignore-Hook.
#
# Exit-Konvention (Netlify): exit 0 = Build ÜBERSPRINGEN, exit 1 = Build LÄUFT.
#
# Zweck: Netlify-Build-Minuten sparen. Ein Deploy ist nur nötig, wenn sich
# etwas Frontend-Relevantes geändert hat — also der Frontend-Code, die
# Build-Konfiguration ODER die committeten Korpus-/Embedding-JSONs unter
# client/public/ (die werden als statische Dateien ausgeliefert).
#
# Reine Backend-Commits (server/), Build-Scripts (scripts/), Roh-Korpus
# (content/resonanzen/raw/) oder Doku (*.md) brauchen KEINEN Frontend-Deploy.
#
# Netlify setzt CACHED_COMMIT_REF (letzter gebauter Commit) und COMMIT_REF
# (aktueller). Fehlt der Cache (erster Build), bauen wir sicherheitshalber.

set -euo pipefail

# Frontend-relevante Pfade — Änderung daran erfordert einen Build.
# client/ schließt client/public/* ein → Korpus-Daten-Updates deployen weiterhin.
PATHS=(
  "client/"
  "index.html"
  "package.json"
  "pnpm-lock.yaml"
  "vite.config.ts"
  "netlify.toml"
)

# Erster Build oder kein Cache-Ref → immer bauen (exit 1).
if [ -z "${CACHED_COMMIT_REF:-}" ] || [ -z "${COMMIT_REF:-}" ]; then
  echo "[netlify-ignore] kein Cache-Ref — Build läuft (Sicherheit)."
  exit 1
fi

# git diff --quiet: exit 0 wenn KEINE Änderung in PATHS, exit 1 wenn Änderung.
if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- "${PATHS[@]}" 2>/dev/null; then
  echo "[netlify-ignore] keine frontend-relevanten Änderungen — Build ÜBERSPRUNGEN."
  exit 0   # skip
else
  echo "[netlify-ignore] frontend-relevante Änderungen erkannt — Build läuft."
  exit 1   # build
fi
