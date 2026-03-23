FROM registry.jiun.dev/library/node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod=false

# Build
FROM base AS build
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=deps /app/apps/web/node_modules apps/web/node_modules
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY tsconfig.base.json ./
WORKDIR /app/apps/web
RUN pnpm build

# Serve with nginx
FROM registry.jiun.dev/library/nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
