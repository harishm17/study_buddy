# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js frontend

# Stage 1: Dependencies
FROM node:20-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
# Note: keep npm install for compatibility when lockfile can drift.
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --prefer-offline --no-audit --progress=false

# Stage 2: Builder
FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL for Prisma (cached between builds)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy package files for Prisma generation (cache this layer separately)
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Generate Prisma Client (cached if schema unchanged)
RUN npx prisma generate

# Copy source code (this invalidates cache when code changes)
COPY . .

# Build Next.js application.
# Cache .next build artifacts across docker builds for faster rebuilds.
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Stage 3: Runner
FROM node:20-slim AS runner
WORKDIR /app

# Install OpenSSL for Prisma (cached layer)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

# Copy necessary files from builder
# In standalone mode, Next.js includes public/, node_modules, and server files in .next/standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy Prisma files (not included in standalone)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# PORT will be set by Cloud Run, defaults to 3000 for local development
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
