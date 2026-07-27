# Song Cards

Song Cards is a small self-hosted web app that lets a child scan a printed
ArUco marker and play its assigned song through an AirPlay receiver. The
browser only scans the card; OwnTone running on the local Linux host owns audio
playback.

## Interfaces

- `/play` — child-facing camera scanner suitable for an iPad Home Screen app
- `/control` — caregiver playback, state, and volume controls
- `/admin` — protected song upload, marker assignment, and printable card sheet

The scanner uses the `ARUCO_MIP_36h12` dictionary, which provides 250 marker
identifiers. Marker numbers are never automatically reused.

## Local development

Requirements:

- Node.js 24
- A current browser with camera access

```bash
cp .env.example .env
npm install
npm run dev
```

The default development administrator password is `admin` when
`ADMIN_PASSWORD` is unset. Mock playback is enabled by default, so OwnTone is
not required to work on the interface.

Open:

```text
http://127.0.0.1:3000/play
http://127.0.0.1:3000/control
http://127.0.0.1:3000/admin
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
