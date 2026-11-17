# Security policy

## Deployment boundary

Song Cards is designed for a trusted home network. The kiosk, marker images,
scan endpoint, player status, and kiosk playback controls intentionally do not
require authentication. This keeps the child-facing experience comparable to
using a local AirPlay receiver.

Do not expose Song Cards directly to the public internet. Bind the application
to loopback as shown in `compose.yml`, place it behind a trusted HTTPS reverse
proxy, and restrict access to the LAN or a VPN. HTTPS is required for camera
access on mobile devices, but encryption is not access control.

All `/admin` pages and administrative data or mutation endpoints require the
administrator session; the login and logout endpoints are the natural
exceptions. Use a unique administrator password of at least 12 characters and
a random session secret of at least 32 characters. The reverse proxy must
replace, not append untrusted client values for, the forwarding headers it
supplies.

The URL importer invokes yt-dlp against public HTTPS media URLs. Only import
media you trust and have permission to download. Song Cards rejects obvious
local and private destinations, but a downloader that follows remote redirects
should still be treated as privileged software.

Optional voice settings and service API keys are administrator-only. Keys are
stored in SQLite and are redacted from responses; protect database backups as
credentials. Voice endpoints share the trusted-LAN kiosk boundary and require
same-origin mutation requests. Recordings are size- and duration-limited, and
only one voice job runs at once. Job identifiers are random capability tokens.
The agent can only select candidates from bounded searches; it cannot supply
arbitrary URLs to the downloader or call administrative tools. Preferred
channels restrict discovery but do not guarantee that their content is suitable
for every child. Only enable online discovery for sources you trust.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use a private
[GitHub security advisory](https://github.com/d1scolor/song-cards/security/advisories/new)
and include the affected version, reproduction steps, impact, and any suggested
mitigation. You should receive an acknowledgement within seven days.

Security fixes are made on the current release line. Older images may not
receive backports; deployments should pin versions for reproducibility and
upgrade after reviewing release notes.
