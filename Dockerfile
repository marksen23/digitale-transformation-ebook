# syntax=docker/dockerfile:1

# Self-Hosting-Image (Coolify, VPS, Raspberry Pi 400). Parallel zu Render:
# dieselben Befehle wie render.yaml, ohne dessen Build-Filter oder Start zu
# ändern. Nicht `pnpm build` — das würde Korpus-Index, Embeddings und PDF
# neu rechnen (macht die GitHub-Action).
#
# Basis node:22.13.0-bookworm-slim ist ein Multi-Arch-Manifest (linux/amd64
# und linux/arm64). Kein --platform-Pin, damit `docker build` auf dem Pi 400
# (64-bit-OS) nativ arm64 erzeugt.

FROM node:22.13.0-bookworm-slim AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_INTEGRITY_KEYS=0
# Node 22.13 bringt Corepack mit. Die Signaturprüfung dieses Bundles scheitert
# gelegentlich am pnpm-Release (derselbe Fall wie in RENDER_DEPLOY.md) — deshalb
# COREPACK_INTEGRITY_KEYS=0, nur im Image, nicht auf Render.
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate \
 && pnpm config set package-import-method copy

# --- Alle Abhängigkeiten (Vite, esbuild, TypeScript) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- Frontend + Server, analog zum Render-Build ---
FROM deps AS build
# Vite brennt diese Werte ins Frontend. Coolify übergibt gleichnamige
# Build-Variablen als --build-arg. Leer = kein Analytics-Script.
ARG VITE_SITE_URL=https://digitale-transformation-ebook.de
ARG VITE_ANALYTICS_ENDPOINT=
ARG VITE_ANALYTICS_WEBSITE_ID=
ARG VITE_OAUTH_PORTAL_URL=
ARG VITE_APP_ID=
ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_ANALYTICS_ENDPOINT=$VITE_ANALYTICS_ENDPOINT \
    VITE_ANALYTICS_WEBSITE_ID=$VITE_ANALYTICS_WEBSITE_ID \
    VITE_OAUTH_PORTAL_URL=$VITE_OAUTH_PORTAL_URL \
    VITE_APP_ID=$VITE_APP_ID
COPY . .
RUN pnpm build:frontend && pnpm build:server \
 && node docker/assert-server-imports.mjs \
 && test -f dist/index.js \
 && test -f dist/public/index.html \
 && test -f dist/public/ebook_content.md

# --- Nur Produktionsabhängigkeiten (esbuild lässt Packages extern) ---
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
COPY docker/prune-runtime-deps.mjs ./docker/prune-runtime-deps.mjs
# Voller Prod-Install aus dem Lockfile, danach nur die Import-Hülle des
# Server-Bundles behalten (express, pdf-lib, @anthropic-ai/sdk). Die
# Frontend-Packages liegen in "dependencies", der Server lädt sie nicht.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod \
 && node docker/prune-runtime-deps.mjs \
 && test -f node_modules/express/package.json \
 && test -f node_modules/pdf-lib/package.json \
 && test -f node_modules/@anthropic-ai/sdk/package.json \
 && node --input-type=module -e "import 'express'; import 'pdf-lib'; import '@anthropic-ai/sdk'"

# --- Laufzeit ---
FROM node:22.13.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOME=/tmp
RUN groupadd --system --gid 1001 appuser \
 && useradd --system --uid 1001 --gid 1001 --no-create-home --shell /usr/sbin/nologin appuser
COPY --from=prod-deps --link --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=prod-deps --link --chown=1001:1001 /app/package.json ./package.json
COPY --from=build --link --chown=1001:1001 /app/dist ./dist
# werkRetrieval und der Ebook-Loader suchen client/public relativ zum
# Working Directory. Vite hat dieselben Dateien bereits nach dist/public
# kopiert — Symlink statt zweiter Kopie der Korpus-JSONs.
RUN mkdir -p /app/client \
 && ln -s ../dist/public /app/client/public \
 && chown 1001:1001 /app/client
USER 1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
LABEL org.opencontainers.image.source="https://github.com/marksen23/digitale-transformation-ebook" \
      org.opencontainers.image.title="Resonanzvernunft — Digitale Transformation" \
      org.opencontainers.image.description="Self-hosted Express server for the Resonanzvernunft ebook"
ENTRYPOINT ["node", "dist/index.js"]
