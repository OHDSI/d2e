# mri-vue

> A Vue 3 project built with Vite

## Requirements

- Node v14+
- npm v5++ / yarn 1.9.4

## Project setup

```
yarn
```

### Compiles and hot-reloads for development

Uses Vite dev server with fast HMR (Hot Module Replacement):

```
yarn serve
```

### Compiles and minifies for production (files are copied over to MRI)

Vite optimized production build:

```
yarn build              # Standard production build
yarn build:local        # Build with localhost host
yarn build:mock         # Build with mock data
yarn build:watch        # Build in watch mode (for local single-spa dev)
```

**Note:** Commit built files after running build commands.

### Serve lifecycles for local single-spa development

To develop with import map overrides (loading the app inside the portal instead of standalone):

```
yarn dev
```

This starts a watch build + preview server on `http://localhost:8085`, serving `lifecycles.js` for the portal's import map to consume.

### Lints and fixes files

```
yarn lint
```

### Run your unit tests

Uses Vitest (Vite-native test runner):

```
yarn test:unit          # Run unit tests
yarn test:ci            # Run tests with coverage
```

## Configuration

### Logo Customization

Configure the application logo at runtime via `public/config.json`:

```json
{
  "logoUrl": "/logos/your-logo.svg"
}
```

**Supported formats:** SVG (recommended), PNG, JPEG, WebP

The application will automatically fall back to the default ATLAS logo if the configured logo fails to load.

For Docker deployments, mount a custom config file:

```yaml
volumes:
  - ./custom-config.json:/app/config.json:ro
```

### Theme Configuration

The application has a single theme. There is no theme switch and no
`applyTheme()` call — the Atlas theme was removed.

Colours come from two places:

- `src/styles/themes/_main.scss` defines the `--color-*` palette on `:root`.
  Both entry points (`src/main.ts`, `src/lifecycles.ts`) import it directly.
- `src/plugins/vuetify.ts` builds the Vuetify `d2e` theme from the design
  tokens in `@d2e/ui` (`buildD2eVuetifyOptions()` plus `@d2e/ui/tokens.css`).

New styles should use the `@d2e/ui` tokens. The `--color-*` palette is a
legacy layer that is being retired; see
`docs/projects/vue-mri-ui/design-system/TOKEN-AUDIT-2026-09-01.md` in the
workspace for the consolidation plan.

## Local Development Setup

### SSL Certificate Setup for shinylive Dashboards

To avoid SSL warnings and enable shinylive dashboards to work properly in local development:

1. **Extract Caddy root certificate:**
   ```bash
   docker cp alp-caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
   ```

2. **Install certificate on macOS:**
   - Find and click on `caddy-root.crt` file
   - Install in Keychain Access
   - Double click `D2E Local CA - 2024 ECC Root`
   - Expand `Trust` section
   - For `When using this certificate`: select **Always Trust**

3. **Restart Chrome:**
   - Warning page should not appear when accessing `localhost:41100`
   - Shinylive dashboards will now work without SSL errors

**Why this is needed:** Shinylive and modern browser features require valid HTTPS. D2E uses Caddy with self-signed certificates locally, which browsers don't trust by default.

### Mock Server for Development

To run the application with mock data for standalone development:

```bash
yarn build:mock                  # Build with mock configuration
yarn start:mock                  # Start mock server (port 3131)
```

The mock server provides sample data without requiring backend services.

### Single-Spa Development with Import Map Overrides

To develop the vue-mri app loaded inside the portal (as a single-spa microfrontend) instead of standalone on port 8081:

**1. Start the lifecycles server:**

```bash
yarn dev
```

This serves `lifecycles.js` on `http://localhost:8085/lifecycles.js` with watch mode (auto-rebuilds on changes).

**2. Start the portal:**

```bash
cd plugins/ui/apps/portal
yarn start
```

**3. Enable import map overrides UI:**

In the portal browser tab, open DevTools console and run:

```javascript
localStorage.setItem('devtools', 'true');
location.reload();
```

This shows the "Import Map Overrides" panel (bottom-right corner of the portal).

**4. Override the plugin URL:**

In the import map overrides panel:
- Find the vue-mri plugin entry (e.g., `/mri/lifecycles.js`)
- Override it to point to: `http://localhost:8085/lifecycles.js`

**Note:** The local Vue MRI override is served over HTTP for parity with the working `concept-sets` import-override flow. The portal still runs on HTTPS at `https://localhost:41100`.

**5. Navigate to the plugin route:**

Go to `/d2e/portal/researcher/cohort` (or wherever the plugin is registered) to see your local changes.

**How it works:**

- The portal uses `systemjs` to load plugin modules
- `import-map-overrides` intercepts module resolution and redirects to your local server
- `ResearcherStudyPluginRenderer` registers the app with `registerSingleSpaApp()` which calls `System.import()`
- The override makes `System.import()` fetch from `http://localhost:8085` instead of the built-in path

**Troubleshooting:**

- **Certificate warnings on portal:** Trust the portal certificate at `https://localhost:41100`
- **Override still not loading:** Open `http://localhost:8085/lifecycles.js` directly and confirm it loads without TLS errors
- **Module not loading:** Check the browser console for `[singleSpaRegistry]` debug logs showing the resolved URL
- **Props not passing:** The portal passes `customProps` (datasetId, getToken, etc.) — verify they appear in the vue-mri app's `handleInstance()` callback

## Tech Stack

- **Vue 3** - Composition API with `<script setup>`
- **Vite** - Fast dev server and build tool
- **Vitest** - Unit testing framework
- **TypeScript** - Type safety
- **ESLint + Prettier** - Code linting and formatting

For detailed Vue 3 information, see the [Vue 3 documentation](https://vuejs.org/).
For Vite configuration, see the [Vite documentation](https://vitejs.dev/).
