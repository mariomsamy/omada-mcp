# syntax=docker/dockerfile:1.7

# Base image pinned by digest (multi-arch index); bump deliberately via Dependabot.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS deps
WORKDIR /app
COPY package*.json ./
# No lifecycle scripts: a compromised transitive install script must not run at build time.
RUN npm ci --ignore-scripts

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS runtime

# OCI metadata labels
LABEL org.opencontainers.image.title="Omada MCP"
LABEL org.opencontainers.image.description="Security-focused MCP server for TP-Link Omada Open API workflows"
LABEL org.opencontainers.image.authors="mariomsamy and contributors (see NOTICE.md)"
LABEL org.opencontainers.image.url="https://github.com/mariomsamy/omada-mcp"
LABEL org.opencontainers.image.source="https://github.com/mariomsamy/omada-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/mariomsamy/omada-mcp#readme"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system omada && useradd --system --gid omada --create-home omada
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
# Run as an unprivileged user. Recommended runtime flags:
#   docker run --read-only --cap-drop=ALL --security-opt no-new-privileges ...
USER omada:omada
CMD ["node", "dist/index.js"]
