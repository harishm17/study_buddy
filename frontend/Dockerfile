# Standard Multi-stage build for Next.js frontend

# Stage 1: Dependencies
FROM node:24-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (Standard version)
RUN npm ci

# Stage 2: Builder
FROM node:24-slim AS builder
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Runner
FROM node:24-slim AS runner
WORKDIR /app

# Install OpenSSL for Prisma (Required for runtime)
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma CLI for `prisma migrate deploy` (Railway runs it as the pre-deploy command). The
# standalone build has only the client, so install the CLI at the locked version on its own.
COPY package-lock.json /tmp/package-lock.json
RUN mkdir -p /opt/prisma && cd /opt/prisma \
    && npm install --no-save --no-audit --no-fund \
       "prisma@$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version")" \
    && ./node_modules/.bin/prisma --version \
    && rm /tmp/package-lock.json && npm cache clean --force
ENV PATH=/opt/prisma/node_modules/.bin:$PATH

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

# Copy necessary files from builder
# Note: Ensure "output: 'standalone'" is in your next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# REMOVED: COPY public folder line (since it doesn't exist in your project)

# Copy Prisma schema/migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]