FROM oven/bun:1.2.21-alpine

WORKDIR /app

# Worker egress guard requires these CLIs in the backend image.
RUN apk add --no-cache bash curl jq wget tailscale

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
WORKDIR /app/backend

CMD ["bun", "run", "src/api/server.ts"]
