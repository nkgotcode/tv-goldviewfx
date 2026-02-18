#!/usr/bin/env bash
set -euo pipefail

OWNER="${OWNER:-nkgotcode}"
TAG="${TAG:-$(git rev-parse --short=12 HEAD)}"

build_and_push() {
  local image_name="$1"
  local dockerfile="$2"
  local image="ghcr.io/${OWNER}/${image_name}:${TAG}"

  echo "Building ${image} from ${dockerfile}"
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -f "${dockerfile}" \
    -t "${image}" \
    --push \
    .

  echo "Tagging latest for ${image_name}"
  docker buildx imagetools create \
    --tag "ghcr.io/${OWNER}/${image_name}:latest" \
    "${image}"
}

build_and_push "tv-goldviewfx-backend" "deploy/docker/backend.Dockerfile"
build_and_push "tv-goldviewfx-frontend" "deploy/docker/frontend.Dockerfile"
build_and_push "tv-goldviewfx-rl-service" "deploy/docker/rl-service.Dockerfile"

echo "Done. Published tag: ${TAG}"
