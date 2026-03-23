FROM registry.jiun.dev/library/node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod=false

# Build with bun
FROM registry.jiun.dev/oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules
COPY packages/shared packages/shared
COPY apps/server apps/server
WORKDIR /app/apps/server
RUN bun build src/index.ts --outdir dist --target bun

# Run
FROM registry.jiun.dev/oven/bun:1-slim
WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

COPY --from=build --chown=appuser:appgroup /app/apps/server/dist ./

USER appuser
EXPOSE 3001
CMD ["bun", "index.js"]
