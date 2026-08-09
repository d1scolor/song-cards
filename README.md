# Song Cards

Song Cards is a self-hosted, child-friendly music kiosk. A child scans a
printed ArUco card and its assigned song plays directly on the kiosk device.
An optional OwnTone integration can instead send every kiosk's scans to a
shared AirPlay speaker.

It is designed for a trusted home network, with a valid HTTPS reverse proxy so
mobile browsers can use the camera and install the kiosk as a Home Screen app.
The kiosk intentionally has no login; caregiver administration is password
protected.

## Interfaces

- `/` — redirects to the child-facing kiosk
- `/kiosk` — child-facing camera scanner and the installed Home Screen app
- `/admin/now-playing` — protected local and optional OwnTone controls
- `/admin/library` — protected browsing, playback, tuning, and song removal
- `/admin/add` — protected audio upload and link import
- `/admin/print` — protected printable card-sheet builder
- `/admin/system` — protected playback and yt-dlp settings/status

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
caregiver's master volume stable and applies a compensated volume for each
song. The targets and response curve can be adjusted under
`/admin/system`, while each song has a separate manual correction under
`/admin/library`. Existing libraries can be analyzed there with one button.

Start and end points are also stored as non-destructive song metadata. Local
and OwnTone playback both observe that window. An authenticated administrator
can set these points while listening; seek controls remain inside the configured
window.

Local-device playback streams the original stored audio through protected
byte-range endpoints. It applies the same automatic and manual loudness
correction and observes the same start/end metadata. Local state belongs to
that browser tab and the device's hardware volume remains an additional final
control.

The deployment-wide kiosk target is selected under **System** without adding
controls to the child-facing screen. With **Kiosk device** selected, the
**Scan my card** tap also unlocks iOS audio before opening the camera; a
successful scan then uses a short-lived signed audio URL and plays on whichever
device scanned the card.

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

The development-only administrator password is `admin` when `ADMIN_PASSWORD`
is unset. Device-local playback is the default. Set `PLAYBACK_BACKEND=mock`
only when developing the external-player interface without OwnTone.

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

Requirements:

- A Linux host with Docker Engine and Docker Compose
- A trusted local network
- A reverse proxy serving the app with a certificate trusted by kiosk devices

Copy `.env.example` to `.env`, set an administrator password of at least 12
characters and a random `SESSION_SECRET` of at least 32 characters, then start
the standalone app:

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

The app listens only on `127.0.0.1:3000`. A minimal Caddy site is:

```caddyfile
songs.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Configure local DNS so the kiosk resolves that name to the server. The reverse
proxy must preserve the original `Host` header and set the normal
`X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` headers. Caddy
does this by default.

After signing in, add songs, print cards, and choose **Kiosk device** under
**Admin → System**. Open `/kiosk` on the playback device and install that page
to its Home Screen. OS-level Guided Access or app pinning is recommended for a
child-facing device.

### Optional OwnTone and AirPlay

To add shared-speaker playback, configure:

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
On first deployment, open OwnTone on port `3689`, select and pair the desired
AirPlay receiver, and copy its output ID into `OWNTONE_OUTPUT_ID`. The app
shares its media volume with OwnTone at `/srv/media`. Select **OwnTone speaker**
under **Admin → System** after it is connected.

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
KIOSK_PLAYBACK_TARGET=local
```

Use the `nightly` update channel temporarily when a YouTube change has not yet
reached yt-dlp's stable release. An update-check failure leaves the installed
binary in place. Some videos may still require authentication or
Proof-of-Origin token support, which Song Cards intentionally does not
configure.

Environment values are installation defaults. Once a value is saved in the
System interface, the SQLite setting takes precedence.

## Security model

The kiosk scanner and playback controls are intentionally unauthenticated so a
child can use them without accounts, codes, or device pairing. Treat the app
like an AirPlay receiver: deploy it only on a trusted LAN or behind a VPN. A
valid TLS certificate protects traffic but does not make a public deployment
private.

Administration pages and APIs use an expiring secure cookie. Production rejects
the example credentials, and repeated failed logins are temporarily throttled.
Do not expose port `3000` directly or publish Song Cards to the open internet.
See [SECURITY.md](SECURITY.md) for the supported security boundary and reporting
instructions.

## Data and upgrades

The `song-cards-db` volume contains SQLite state and tool updates. The
`song-cards-media` volume contains audio and covers. Back up both volumes
together while the app is stopped. Test restoration before relying on a backup.

For upgrades, back up both volumes, pull or build the desired image, and run
`docker compose up -d`. Pin `APP_IMAGE` to a `sha-<commit>` tag when you need a
reproducible deployment or rollback.

## Build and publish to GHCR

After the repository has a GitHub `origin`, commit changes on a clean `main`
branch and run:

```bash
scripts/publish-image.sh
```

The script authenticates with the GitHub CLI and publishes multi-platform
`sha-<commit>` and `latest` tags to the GHCR image derived from `origin`.

## Contributing and license

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Song Cards is
licensed under [GPL-3.0-only](LICENSE). Third-party software distributed with
the application is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
