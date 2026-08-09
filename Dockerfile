FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM debian:bookworm-slim AS media-tools
ARG TARGETARCH
ARG YTDLP_VERSION=2026.07.04
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && case "$TARGETARCH" in \
       amd64) asset="yt-dlp_linux"; checksum="6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae" ;; \
       arm64) asset="yt-dlp_linux_aarch64"; checksum="b6ce97646773070d7a7ffd6bbbdcaecb47c48483909c54c915bf08a7a9b5e0b1" ;; \
       *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
     esac \
  && curl -fsSL \
       "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${asset}" \
       -o /yt-dlp \
  && curl -fsSL \
       "https://raw.githubusercontent.com/yt-dlp/yt-dlp/${YTDLP_VERSION}/LICENSE" \
       -o /yt-dlp.LICENSE \
  && curl -fsSL \
       "https://raw.githubusercontent.com/yt-dlp/yt-dlp/${YTDLP_VERSION}/THIRD_PARTY_LICENSES.txt" \
       -o /yt-dlp.THIRD_PARTY_LICENSES.txt \
  && echo "${checksum}  /yt-dlp" | sha256sum -c - \
  && chmod 0755 /yt-dlp

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
LABEL org.opencontainers.image.title="Song Cards" \
      org.opencontainers.image.description="A self-hosted, child-friendly music-card kiosk" \
      org.opencontainers.image.source="https://github.com/d1scolor/song-cards" \
      org.opencontainers.image.licenses="GPL-3.0-only"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    YTDLP_BUNDLED_PATH=/usr/local/libexec/yt-dlp
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=media-tools /yt-dlp /usr/local/libexec/yt-dlp
COPY --from=media-tools /yt-dlp.LICENSE /usr/share/doc/song-cards/yt-dlp.LICENSE
COPY --from=media-tools /yt-dlp.THIRD_PARTY_LICENSES.txt /usr/share/doc/song-cards/yt-dlp.THIRD_PARTY_LICENSES.txt
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/doc/song-cards/
RUN mkdir -p /data/db /data/media \
  && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
