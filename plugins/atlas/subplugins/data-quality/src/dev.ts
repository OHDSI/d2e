/**
 * Dev harness for the dashboard — `npm run dev`, then open the printed URL.
 *
 * It exists because /atlas is served from the baked bundled-plugins/atlas inside
 * the trex image, so iterating through the real host costs a build-atlas.sh plus
 * an image rebuild every time. Everything Atlas normally supplies is stubbed
 * here: the host context, the `AtlasCard` wrapper the datasource-sidebar surface
 * mounts the plugin inside, and the /jobplugins responses.
 *
 * Scenarios, by query string:
 *   /                    completed run with results
 *   /?state=RUNNING      job in progress (also SCHEDULED, PENDING, PAUSED)
 *   /?state=FAILED       failed run (also CRASHED, CANCELLED, CANCELLING)
 *   /?state=none         no run recorded for this dataset (404)
 *   /?state=empty        run completed but wrote no DQD artifact
 *   /?state=boom         the endpoint errors
 *   /?state=no-source    no data source selected in the header
 *   /?delay=2000         hold every response back, to look at the loading state
 */
import 'vuetify/styles';
import '@ohdsi/atlas-ui/tokens.css';
import '@mdi/font/css/materialdesignicons.css';
import './style.css';
import { createApp, h, ref } from 'vue';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import { AtlasCard } from '@ohdsi/atlas-ui';
import DataQualityApp from './DataQualityApp.vue';
import { DQ_HOST_CTX, type DqHostCtx } from './types';
import type { OverviewResults } from './api/dqd';

/** Shaped like a real response: the numbers are from an OMOP demo dataset run. */
const OVERVIEW: OverviewResults = {
  verification: {
    plausibility: { pass: 426, fail: 26, total: 452, percentPass: '94%' },
    conformance: { pass: 698, fail: 30, total: 728, percentPass: '96%' },
    completeness: { pass: 395, fail: 1, total: 396, percentPass: '100%' },
    total: { pass: 1519, fail: 57, total: 1576, percentPass: '96%' },
  },
  validation: {
    plausibility: { pass: 291, fail: 0, total: 291, percentPass: '100%' },
    conformance: { pass: 106, fail: 0, total: 106, percentPass: '100%' },
    completeness: { pass: 17, fail: 0, total: 17, percentPass: '100%' },
    total: { pass: 414, fail: 0, total: 414, percentPass: '100%' },
  },
  total: {
    plausibility: { pass: 717, fail: 26, total: 743, percentPass: '97%' },
    conformance: { pass: 804, fail: 30, total: 834, percentPass: '96%' },
    completeness: { pass: 412, fail: 1, total: 413, percentPass: '100%' },
    total: {
      pass: 1933,
      fail: 57,
      total: 1990,
      percentPass: '97%',
      allNa: 1040,
      allError: 0,
      PassMinusAllNA: 893,
      totalMinusAllErrorMinusAllNA: 950,
      correctedPassPercentage: '94%',
    },
  },
  timing: { startTimestamp: '2026-04-29 09:25:00', executionTime: '3 mins' },
  dqdVersion: '2.6.0',
};

const params = new URLSearchParams(window.location.search);
const scenario = params.get('state') ?? 'COMPLETED';
const delay = Number(params.get('delay') ?? 0);

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Stand in for the gateway: the plugin fetches /jobplugins on the current
// origin, so intercepting fetch is enough to drive every branch.
window.fetch = (async (input: RequestInfo | URL) => {
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (scenario === 'none') return new Response('', { status: 404 });
  if (scenario === 'boom') {
    return new Response('', { status: 500, statusText: 'Internal Server Error' });
  }
  if (String(input).includes('/overview')) {
    return json(scenario === 'empty' ? null : OVERVIEW);
  }
  const stateType = scenario === 'empty' ? 'COMPLETED' : scenario;
  return json({ id: 'dev-flow-run', state: { type: stateType } });
}) as typeof fetch;

const hostCtx: DqHostCtx = {
  getToken: async () => 'dev-token',
  datasetId: ref(scenario === 'no-source' ? '' : 'dev-dataset'),
  appId: 'data-quality',
  // No host to borrow i18n from out here, so fall back to the default copy.
  t: (_key, fallback) => fallback ?? _key,
  locale: 'en',
  uiFilesUrl: '',
};

const app = createApp({
  // Atlas mounts this plugin inside `AtlasCard padding="md"`
  // (DataSourcesView's `datasources-view__report`); reproducing that here is
  // what keeps the harness honest about how the dashboard is framed.
  render: () => h(AtlasCard, { padding: 'md' }, () => h(DataQualityApp)),
});
app.use(createVuetify({ icons: { defaultSet: 'mdi', aliases, sets: { mdi } } }));
app.provide(DQ_HOST_CTX, hostCtx);
app.mount('#app');
