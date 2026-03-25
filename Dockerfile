# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# puppeteer is listed as a dependency but is not imported by the server;
# skip the ~300 MB Chromium download entirely.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

# python3 / make / g++ are required to compile bcrypt's native C++ bindings.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies (devDeps are needed for vite, esbuild, tsx).
COPY package*.json ./
RUN npm ci

# Copy the full source tree.
COPY . .

# Build Vite frontend  →  dist/public/
# Build Express server →  dist/index.cjs
RUN npm run build

# The server reads static JSON from two different path styles at runtime:
#   path.join(__dirname, "data", …)  →  __dirname = /app/dist  →  dist/data/
#   path.join(process.cwd(), "server/data/…")  →  cwd = /app  →  server/data/
# Copy the data directory into dist/ to satisfy the __dirname-based path.
RUN cp -r server/data dist/data

# Drop devDependencies so the copied node_modules stays lean.
RUN npm prune --omit=dev


# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

# Production node_modules — native modules (bcrypt) are already compiled for
# this architecture so no build tools are needed here.
COPY --from=builder /app/node_modules ./node_modules

# Bundled server + Vite frontend + data files copied into dist/data/
COPY --from=builder /app/dist ./dist

# Static data for process.cwd()-relative file reads (electricity_prices.json etc.)
COPY --from=builder /app/server/data ./server/data

# Root public/ assets served by express.static('public') in server/index.ts.
# Large case-study files are excluded by .dockerignore.
COPY --from=builder /app/public ./public

# package.json is read by some runtime modules.
COPY --from=builder /app/package.json ./

EXPOSE 5000

# Run as the non-root node user that ships with the base image.
USER node

CMD ["node", "dist/index.cjs"]
