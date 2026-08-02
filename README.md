# Song Cards

Song Cards is a small self-hosted web app that lets a child scan a printed
ArUco marker and play its assigned song through an AirPlay receiver. OwnTone
running on the local Linux host owns shared speaker playback, while
authenticated caregivers can optionally listen on their current browser.

## Interfaces

- `/` — redirects to the child-facing kiosk
- `/kiosk` — child-facing camera scanner and the installed Home Screen app
- `/admin/now-playing` — protected OwnTone and local-device playback controls
- `/admin/library` — protected browsing, playback, tuning, and song removal
- `/admin/add` — protected audio upload and link import
- `/admin/print` — protected printable card-sheet builder
- `/admin/system` — protected OwnTone and yt-dlp status

Install `/kiosk` as the child-facing app. Caregivers can bookmark the protected
`/admin` pages in their normal browser; those routes are intentionally not a
separate installed app.

The former `/play`, `/cards`, `/library`, `/remote`, `/control`, and
`/admin/songs` paths redirect to their current locations so existing bookmarks
continue to work.

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
each song. The targets and response curve can be adjusted under
`/admin/system`, while each song has a separate manual correction under
`/admin/library`. Existing libraries can be analyzed there with one button.

Start and end points are also stored as non-destructive song metadata. OwnTone
seeks to the start when playback begins and Song Cards stops at the end during
normal player polling. An authenticated administrator can set these points
while listening on `/admin/now-playing`; its seek slider is constrained to the
configured playback window.

Local-device playback streams the original stored audio through protected
byte-range endpoints. It applies the same automatic and manual loudness
correction and observes the same start/end metadata. Local state belongs to
that browser tab and the device's hardware volume remains an additional final
control.

The kiosk target is selected under **System** without adding controls to the
child-facing screen. When **This kiosk** is selected, the **Scan my card** tap
also unlocks iOS audio before opening the camera; a successful scan then uses a
short-lived signed audio URL and plays directly on that device.

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
http://127.0.0.1:3000/admin/library
http://127.0.0.1:3000/admin/now-playing
http://127.0.0.1:3000/admin/add
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
KIOSK_PLAYBACK_TARGET=owntone
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
