# =============================================================================
# Multi-stage: build monorepo web app, serve static files with nginx
# =============================================================================
FROM node:22-alpine AS base

ENV NPM_CONFIG_LOGLEVEL=warn \
    PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /repo

# -----------------------------------------------------------------------------
# Builder
# -----------------------------------------------------------------------------
FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY bash-scripts ./bash-scripts
COPY packages ./packages
COPY pages ./pages
COPY chrome-extension ./chrome-extension
COPY scripts ./scripts

ARG CEB_API_URL=http://localhost:3001
ARG CEB_BACKEND_URL=http://localhost:8001
ENV CEB_API_URL=${CEB_API_URL}
ENV CEB_BACKEND_URL=${CEB_BACKEND_URL}
ENV NODE_ENV=production

RUN pnpm install --frozen-lockfile

# Compile workspace libs required by the web bundle (same as local postinstall / turbo ready)
RUN pnpm exec turbo run ready --filter="@extension/web^..."

RUN pnpm -F @extension/web build

# -----------------------------------------------------------------------------
# Production
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production

COPY --from=builder /repo/dist/web /usr/share/nginx/html
COPY docker/web-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
