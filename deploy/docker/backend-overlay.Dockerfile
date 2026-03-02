ARG BASE_IMAGE=ghcr.io/nkgotcode/tv-goldviewfx-backend:nomad-20260223-ad01a89-delta
FROM ${BASE_IMAGE}
WORKDIR /app
COPY backend/package.json ./backend/package.json
RUN cd backend && bun install
COPY backend/src ./backend/src
COPY backend/scripts ./backend/scripts
COPY scripts ./scripts
