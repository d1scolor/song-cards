# Contributing

Issues are welcome for bug reports, feature suggestions, and documentation
problems. This project does not accept pull requests; pull requests may be
closed without review.

## Reporting an issue

Before opening an issue, check whether an existing issue already covers it.
For bugs, include the Song Cards version, browser and operating system,
deployment method, relevant configuration, steps to reproduce, and any useful
logs. Remove passwords, tokens, private URLs, copyrighted audio, databases, and
other household data before posting.

Feature suggestions are also welcome, but opening an issue does not guarantee
that the feature will be implemented.

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

If you make changes in your own fork, the following checks are useful:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Add regression coverage for behavior changes, and update the README when
configuration or deployment behavior changes.

## Licensing

You may fork and modify Song Cards under the project's `GPL-3.0-only` license.
Dependencies and copied assets in a fork must have compatible terms.
