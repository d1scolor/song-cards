#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f Dockerfile ]]; then
  echo "Run this script from the repository root containing Dockerfile." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This directory is not a Git repository." >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Images may only be published from the main branch." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit or stash all changes before publishing an image." >&2
  exit 1
fi

remote="$(git remote get-url origin 2>/dev/null || true)"
case "$remote" in
  git@github.com:*.git)
    repository="${remote#git@github.com:}"
    ;;
  ssh://git@github.com/*.git)
    repository="${remote#ssh://git@github.com/}"
    ;;
  https://github.com/*)
    repository="${remote#https://github.com/}"
    ;;
  *)
    echo "The origin remote must point to a GitHub repository." >&2
    exit 1
    ;;
esac

repository="${repository%.git}"
repository="$(printf '%s' "$repository" | tr '[:upper:]' '[:lower:]')"
image="${IMAGE:-ghcr.io/${repository}}"
platforms="${PLATFORMS:-linux/amd64,linux/arm64}"
commit="$(git rev-parse HEAD)"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required to authenticate with GHCR." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to build and publish the image." >&2
  exit 1
fi

gh auth status --hostname github.com >/dev/null
github_user="$(gh api user --jq .login)"
gh auth token --hostname github.com |
  docker login ghcr.io --username "$github_user" --password-stdin

echo "Publishing ${image}"
echo "Commit:    ${commit}"
echo "Platforms: ${platforms}"

docker buildx build \
  --platform "$platforms" \
  --label "org.opencontainers.image.source=https://github.com/${repository}" \
  --label "org.opencontainers.image.revision=${commit}" \
  --tag "${image}:sha-${commit}" \
  --tag "${image}:latest" \
  --push \
  .

echo "Published:"
echo "  ${image}:sha-${commit}"
echo "  ${image}:latest"
