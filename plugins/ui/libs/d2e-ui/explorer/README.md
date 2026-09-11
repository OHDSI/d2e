# D2E UI component explorer

This sub-project shows the `@d2e/ui` components in a browser. It uses
[Histoire](https://histoire.dev/). The stories are in `../src/components`.

## How to start it

The explorer needs Node 20.19 or later. Your default Node can be older.

```bash
cd plugins/ui/libs/d2e-ui/explorer
source "$NVM_DIR/nvm.sh" && nvm use   # reads .nvmrc
npm ci
npm run dev
```

Then open the address that the command prints. The default is
<http://localhost:6006>.

## How to build a copy that you can share

```bash
npm run build
python3 -m http.server --directory .histoire/dist 6007
```

`node_modules/` and `.histoire/` are not in git.

## How to add a story

Put the story next to its component in `../src/components`. Give it the name
`<Component>.story.vue`. The explorer finds it. Do not restart the server.

## Why this is not a workspace package

`plugins/ui/package.json` sets `overrides.vite` to `6.4.2`. The override holds
`libs/react-notebook` at vite 6. Bun applies an override to all packages in the
workspace. Histoire needs vite 7.

The workspace globs are `libs/*` and `apps/*`. They match one level only, so
this directory is outside the workspace. It uses npm and its own lockfile, and
it can therefore use vite 7.

Two rules follow from this:

- Do not move this directory into `libs/` or into `apps/`.
- Do not change `overrides.vite`.

A test in `../src/__tests__/explorer-parity.test.ts` fails if either rule is
broken. If the workspace moves to vite 7 later, this sub-project can move back
into the library, and the stories do not change.

## Why the versions are pinned

`vue` and `vuetify` must stay close to `apps/vue-mri-ui-lib`. The explorer
shows what the application renders, so a large difference makes it lie.

`vuetify` agrees exactly, at 3.12.0.

`vue` cannot agree exactly today. The application pins 3.5.17, and
`@histoire/plugin-vue@1.0.0-beta.1` needs `vue ^3.5.26`. `npm ci` fails if you
set 3.5.17 here. The explorer therefore pins 3.5.26, and the parity test
compares the major and minor version only. Raise the application to 3.5.26 or
later if you want an exact match.

The parity test is `../src/__tests__/explorer-parity.test.ts`.
