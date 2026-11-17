# Third-party software

Song Cards is licensed under `GPL-3.0-only`. It uses and, in its container
image, redistributes software maintained by other projects. Those projects
remain under their own licenses and retain their respective copyright notices.

## Application dependencies

The exact dependency versions are recorded in `package-lock.json`.

| Package | License | Project |
| --- | --- | --- |
| @ricky0123/vad-web | ISC | <https://github.com/ricky0123/vad> |
| onnxruntime-web | MIT | <https://github.com/microsoft/onnxruntime> |
| better-sqlite3 | MIT | <https://github.com/WiseLibs/better-sqlite3> |
| js-aruco2 | MIT | <https://github.com/damianofalcioni/js-aruco2> |
| lucide-react | ISC | <https://lucide.dev> |
| Next.js | MIT | <https://nextjs.org> |
| PostCSS | MIT | <https://postcss.org> |
| React and React DOM | MIT | <https://react.dev> |
| sharp | Apache-2.0 | <https://sharp.pixelplumbing.com> |
| Zod | MIT | <https://zod.dev> |

Sharp uses libvips, which is licensed under `LGPL-2.1-or-later`. Its source and
license information are available from <https://github.com/libvips/libvips>.
Transitive JavaScript packages and their license metadata are recorded in the
installed packages referenced by `package-lock.json`.

Voice recording also distributes the Silero VAD v5 model under MIT. Its source
and license are available at <https://github.com/snakers4/silero-vad>. The VAD,
Silero, and ONNX Runtime notices are retained in `public/voice-notices.txt`.

## Container tooling

The application image includes the following independently maintained command
line tools:

- **yt-dlp.** The Dockerfile pins an official PyInstaller release binary.
  yt-dlp's own source is dedicated under the Unlicense, while its PyInstaller
  executable bundles third-party components and is distributed as a combined
  work under `GPL-3.0-or-later`. Source, the release-specific license, and the
  complete bundled notices are available at
  <https://github.com/yt-dlp/yt-dlp/tree/2026.07.04>.
- **FFmpeg and FFprobe.** These are installed from Debian Bookworm. FFmpeg is
  primarily `LGPL-2.1-or-later`; Debian's build may enable optional components
  that make the resulting binaries `GPL-2.0-or-later`. FFmpeg licensing details
  are at <https://ffmpeg.org/legal.html>, and Debian source packages are at
  <https://sources.debian.org/src/ffmpeg/>.
- **Node.js.** The runtime is supplied by the official Node.js Debian image and
  is licensed under MIT with bundled third-party components. Source and notices
  are available at <https://github.com/nodejs/node>.

## Optional OwnTone service

`docker compose --profile airplay` can start the separately packaged OwnTone
container. OwnTone is not linked into Song Cards and is not required for local
device playback. OwnTone is licensed under `GPL-2.0-or-later`; its source and
license are available at <https://github.com/owntone/owntone-server>.

This file is a practical inventory, not legal advice. Redistributors should
retain upstream notices and review the source-offer obligations for the exact
artifacts they distribute.
