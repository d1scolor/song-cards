#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit the application changes before publishing an image tagged with their commit.' >&2
  exit 1
fi
docker version --format '{{.Server.Version}}' >/dev/null
revision="$(git rev-parse HEAD)"
image_name="${IMAGE_NAME:-ghcr.io/d1scolor/song-cards}"
platforms="${PLATFORMS:-linux/amd64,linux/arm64}"
docker buildx build \
  --platform "$platforms" \
  --tag "$image_name:sha-$revision" \
  --tag "$image_name:latest" \
  --label "org.opencontainers.image.revision=$revision" \
  --push .
