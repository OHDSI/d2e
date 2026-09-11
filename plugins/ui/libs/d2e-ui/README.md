# `@d2e/ui`

Vue 3 and Vuetify components for D2E, with the design tokens from the D2E
design system. The application reads the source directly through vite aliases.
Every other consumer uses the built artifact — see below.

## Consuming the built package

The application consumes this package as **source**, through aliases in
`apps/vue-mri-ui-lib/vite.config*.ts`. Any other consumer should use the built
artifact:

```ts
import { D2eButton, D2eDialog } from "@d2e/ui";
import "@d2e/ui/tokens.css";
import "@d2e/ui/style.css";   // component styles — required for the built package
```

`style.css` is new with the build. Scoped SFC styles used to be compiled into
each consumer's own bundle; the built package emits them as one file instead.
The application does not need it while it reads source.

`vue` and `vuetify` are peer dependencies and are never bundled. Components
import the Vuetify pieces they use, so a consumer does **not** need
`vite-plugin-vuetify`.

## Commands

```bash
bun run build          # dist/index.js, dist/index.css, dist/types
bun run verify:dist    # checks exports and that peers stayed external
bun run test           # unit tests
bun run tokens:build   # write src/tokens/tokens.css from src/tokens/tokens.ts
bun run tokens:check   # fail if tokens.css is not current
bun run lint           # prettier
```

## How to look at the components

Read [explorer/README.md](./explorer/README.md). The explorer is a separate
npm sub-project, because Histoire needs a different vite version from the
workspace.

## Tokens

`src/tokens/tokens.ts` is the source of truth. `src/tokens/tokens.css` is
generated — do not edit it. `src/tokens/theme.ts` builds the Vuetify theme
from the same tokens.
