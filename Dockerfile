# Hosted TrustModel MCP server (streamable-HTTP) — TRUS-1712.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
# PORT, TRUSTMODEL_BASE_URL, MCP_ALLOWED_ORIGINS via env. Auth is per-request (Bearer).
CMD ["node", "dist/http-server.js"]
