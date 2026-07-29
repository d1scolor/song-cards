# Song Cards

Song Cards is a small self-hosted web app that lets a child scan a printed
ArUco marker and play its assigned song through an AirPlay receiver. The
browser only scans the card; OwnTone running on the local Linux host owns audio
playback.

## Interfaces

- `/` — choice of kiosk or administrator interface
- `/kiosk` — child-facing camera scanner suitable for an iPad Home Screen app
- `/library` — caregiver song browsing and direct playback
- `/remote` — caregiver playback, state, and volume controls
- `/admin/songs` — protected song upload, import, and marker assignment
- `/admin/print` — protected printable card-sheet builder
- `/admin/system` — protected OwnTone and yt-dlp status

The former `/play`, `/cards`, and `/control` paths redirect to their new
locations so existing bookmarks continue to work.

Uploaded cover images are validated, resized, and stored as WebP files. They
appear after a successful scan and in both playback control interfaces.

Audio uploads are inspected with FFprobe rather than trusted by filename or
browser MIME type. Known formats are preserved when possible; WebM, Opus,
video containers, and other decodable formats are normalized to M4A/AAC with
FFmpeg.

The administrator can also paste a public HTTPS URL supported by yt-dlp,
including YouTube and Bilibili. Song Cards imports one video's audio, title,
artist, and thumbnail as a background job. Playlists, local/private hosts, and
unauthenticated import requests are rejected. Only import media you own or
have permission to download.

New audio is measured with FFmpeg's EBU R128 analyzer. Song Cards keeps the
caregiver's master volume stable and sends a compensated volume to OwnTone for
each song. The targets and calibrated response curve can be adjusted under
`/admin/system`, while each song has a separate manual correction under
`/admin/songs`. Existing libraries can be analyzed there with one button.

Start and end points are also stored as non-destructive song metadata. OwnTone
seeks to the start when playback begins and Song Cards stops at the end during
normal player polling. An authenticated administrator can set these points
while listening on `/remote`; its seek slider is constrained to the configured
playback window.

The scanner uses the `ARUCO_MIP_36h12` dictionary, which provides 250 marker
identifiers. Deleting a song releases its marker number for reuse.

## Local development

Requirements:

- Node.js 24
- FFmpeg and FFprobe
- A current browser with camera access
- yt-dlp for testing YouTube imports outside Docker

```bash
cp .env.example .env
npm install
npm run dev
```

The default development administrator password is `admin` when
`ADMIN_PASSWORD` is unset. Mock playback is enabled by default, so OwnTone is
not required to work on the interface.

If yt-dlp is not on `PATH`, point the application to it with `YTDLP_PATH`.

Open:

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/library
http://127.0.0.1:3000/remote
http://127.0.0.1:3000/admin/songs
```

`localhost` and `127.0.0.1` are accepted by browsers for camera development.
An iPad or another network device must access the app through a trusted HTTPS
reverse proxy.

## Linux deployment

Copy `.env.example` to `.env`, set a strong `ADMIN_PASSWORD` and
`SESSION_SECRET`, then configure:

```dotenv
PLAYBACK_BACKEND=owntone
OWNTONE_URL=http://host.docker.internal:3689
OWNTONE_MEDIA_DIRECTORY=/srv/media
OWNTONE_OUTPUT_ID=
```

Start the app and OwnTone:

```bash
docker compose --profile airplay up -d --build
docker compose ps
```

OwnTone uses host networking so Bonjour/mDNS can discover AirPlay receivers.
The application remains bound to `127.0.0.1:3000`; point the existing HTTPS
reverse proxy there.

The application image includes FFmpeg, FFprobe, Node as yt-dlp's JavaScript
runtime, and a checksum-verified official yt-dlp binary. The bundled binary is
copied into `/data/db/tools` and checks its configured update channel at most
once per day. Its version and manual update control are shown under the
YouTube import form.

The default import limits and updater behavior can be changed in `.env`:

```dotenv
MAX_UPLOAD_MB=100
MAX_COVER_MB=10
MAX_SONG_DURATION_MINUTES=30
YOUTUBE_IMPORT_TIMEOUT_SECONDS=600
YTDLP_AUTO_UPDATE=true
YTDLP_UPDATE_CHANNEL=stable
YTDLP_UPDATE_INTERVAL_HOURS=24
```

Loudness defaults can also be supplied through the environment. Once changed
in the System interface, the database values take precedence:

```dotenv
LOUDNESS_COMPENSATION_ENABLED=true
LOUDNESS_TARGET_LUFS=-16
LOUDNESS_SHORT_TERM_TARGET_LUFS=-13.5
VOLUME_CURVE_DIVISOR=74
```

Use the `nightly` update channel temporarily when a YouTube change has not yet
reached yt-dlp's stable release. An update-check failure leaves the installed
binary in place. Some videos may still require authentication or
Proof-of-Origin token support, which Song Cards intentionally does not
configure.

On first deployment, open OwnTone on port `3689`, select and pair the desired
AirPlay receiver, and copy its output ID into `OWNTONE_OUTPUT_ID`. The app
shares its media volume with OwnTone at `/srv/media`.

## Build and publish to GHCR

After the repository has a GitHub `origin`, commit changes on a clean `main`
branch and run:

```bash
scripts/publish-image.sh
```

The script authenticates with the GitHub CLI and publishes multi-platform
`sha-<commit>` and `latest` tags to the GHCR image derived from `origin`.
