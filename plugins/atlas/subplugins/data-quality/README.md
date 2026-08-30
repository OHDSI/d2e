# Data Quality Dashboard Development

This package is an Atlas sub-plugin. Use its Vite dev harness for fast UI-only
work; use the Atlas build when testing the version embedded in TREX.

## UI Development

The dev server renders the dashboard outside Atlas with a stubbed host context,
an `AtlasCard` container, and mocked `/jobplugins` responses. It does not need
a running TREX instance.

```sh
cd plugins/atlas/subplugins/data-quality
npm install
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). The harness reloads
changes automatically. Use query parameters to exercise dashboard states:

| URL suffix | Scenario |
| --- | --- |
| `?state=RUNNING` | A job in progress (`SCHEDULED`, `PENDING`, and `PAUSED` also work). |
| `?state=FAILED` | A failed job (`CRASHED`, `CANCELLED`, and `CANCELLING` also work). |
| `?state=none` | No run exists for the selected dataset. |
| `?state=empty` | A completed run with no DQD artifact. |
| `?state=boom` | A server error. |
| `?state=no-source` | No selected data source. |
| `?delay=2000` | Delay responses to inspect loading states. |
| `?token=late` | Delay token availability to reproduce login initialization. |

Run the package checks when needed:

```sh
npm run typecheck
npm test
```

## Testing in TREX

TREX loads the compiled SystemJS bundle at
`/atlas/plugins/data-quality/index.system.js`; it does not use the Vite dev
server or this package's source files directly.

From the repository root, rebuild and stage the Atlas plugin after data-quality
changes:

```sh
./scripts/build-atlas.sh
```

The script installs dependencies, runs this package's production build, builds
the parent Atlas plugin, and writes its tarball to
`services/trex/plugin-artifacts/`. The script requires `GITHUB_TOKEN` (or an
authenticated `gh` CLI session) with `read:packages` access.