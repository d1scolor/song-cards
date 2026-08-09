# Contributing

Thanks for helping improve Song Cards.

## Development

Requirements are Node.js 24, FFmpeg/FFprobe, and a current browser. Copy
`.env.example` to `.env`, then run:

```bash
npm ci
npm run dev
```

Device-local playback requires no OwnTone service. Set
`PLAYBACK_BACKEND=mock` to exercise the external-player UI during development,
or use the Compose `airplay` profile with a real OwnTone installation.

Before submitting a change, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Keep changes focused, add regression coverage for behavior changes, and update
the README when configuration or deployment behavior changes. Do not include
copyrighted audio, credentials, databases, or other household data in issues or
commits.

## Licensing

By submitting a contribution, you agree that it may be distributed under the
project's `GPL-3.0-only` license. Dependencies and copied assets must have
compatible terms, and new runtime or container dependencies should be added to
`THIRD_PARTY_NOTICES.md`.
