ARG BASE_IMAGE=ghcr.io/nkgotcode/tv-goldviewfx-rl-service:nomad-rl-20260223-ad01a89-delta
FROM ${BASE_IMAGE}
WORKDIR /app/backend/rl-service
COPY backend/rl-service ./
WORKDIR /app/backend/rl-service/src
