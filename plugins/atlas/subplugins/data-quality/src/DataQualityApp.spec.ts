import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { createVuetify } from 'vuetify';
import { AtlasSkeleton } from '@ohdsi/atlas-ui';
import DataQualityApp from './DataQualityApp.vue';
import { DQ_HOST_CTX, type DqHostCtx } from './types';
import {
  getDataQualityOverview,
  getLatestDataQualityFlowRun,
  type FlowRun,
  type FlowRunStateType,
  type OverviewResults,
} from './api/dqd';

// Only the HTTP boundary is faked; the real composable drives every state below,
// so these assert on what the dashboard actually does rather than on a stub.
vi.mock('./api/dqd', () => ({
  getLatestDataQualityFlowRun: vi.fn(),
  getDataQualityOverview: vi.fn(),
  // Real value, not a stub: it is the sentence the composable falls back to.
  LOAD_FAILED_MESSAGE: 'Unable to load data quality results. Please try again.',
}));

/** Mirrors useDataQualityOverview's own constants, which it keeps private. */
const POLL_MS = 10_000;
const AUTH_RETRY_MS = 500;
/** Consecutive quiet failures the composable tolerates before it reports one. */
const POLL_FAILURE_TOLERANCE = 2;

const vuetify = createVuetify({ theme: false as never });
const wrappers: VueWrapper[] = [];

function mountApp(overrides: Partial<DqHostCtx> = {}): VueWrapper {
  const ctx: DqHostCtx = {
    getToken: async () => 'token',
    datasetId: ref('dataset-1'),
    appId: 'app-1',
    locale: 'en',
    uiFilesUrl: '',
    t: (_key, fallback) => fallback ?? _key,
    ...overrides,
  };
  const wrapper = mount(DataQualityApp, {
    global: { plugins: [vuetify], provide: { [DQ_HOST_CTX]: ctx } },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function flowRun(type: FlowRunStateType): FlowRun {
  return { id: 'run-1', state: { type } };
}

function group(base: number) {
  return { pass: base + 1, fail: base + 2, total: base + 3, percentPass: '95%' };
}

/** Enough of a real overview for the dashboard to render its ready state. */
function overviewResults(): OverviewResults {
  return {
    verification: {
      plausibility: group(100),
      conformance: group(200),
      completeness: group(300),
      total: group(400),
    },
    validation: {
      plausibility: group(500),
      conformance: group(600),
      completeness: group(700),
      total: group(800),
    },
    total: {
      plausibility: group(900),
      conformance: group(1000),
      completeness: group(1100),
      total: {
        ...group(1200),
        allNa: 12,
        allError: 3,
        PassMinusAllNA: 1189,
        totalMinusAllErrorMinusAllNA: 1188,
        correctedPassPercentage: '84%',
      },
    },
  };
}

/**
 * Fake-timer counterpart to flushPromises: advances the clock and drains the
 * awaits each timer callback starts. flushPromises itself parks on a real
 * setTimeout, so it never settles once the timers are faked.
 */
async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
}

beforeEach(() => {
  vi.mocked(getLatestDataQualityFlowRun).mockReset();
  vi.mocked(getDataQualityOverview).mockReset();
  // The composable logs tolerated poll failures; keep the run output readable.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// The in-progress branch starts a poll; unmounting stops it so it cannot leak
// into the next test.
afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount();
  vi.useRealTimers();
  vi.mocked(console.warn).mockRestore();
});

describe('DataQualityApp loading state', () => {
  it('renders a skeleton while the first load is in flight', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockReturnValue(new Promise(() => {}));

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.findComponent(AtlasSkeleton).exists()).toBe(true);
  });
});

describe('DataQualityApp in-progress state', () => {
  it('shows the job state in a chip instead of interpolating it into prose', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('RUNNING'));

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-testid="dq-job-state"]').text()).toBe('RUNNING');
  });

  it('keeps a spinner rather than a skeleton, because the job has no known duration', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('RUNNING'));

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.findComponent(AtlasSkeleton).exists()).toBe(false);
    expect(wrapper.find('.v-progress-circular').exists()).toBe(true);
  });
});

describe('DataQualityApp error state', () => {
  it('refetches when the retry button is clicked', async () => {
    vi.mocked(getLatestDataQualityFlowRun)
      .mockRejectedValueOnce(new Error('gateway exploded'))
      .mockResolvedValueOnce(null);

    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('[data-testid="dq-retry"]').trigger('click');
    await flushPromises();

    expect(getLatestDataQualityFlowRun).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(true);
  });

  it('reports a failure whose error carries no message, rather than reading it as no-run', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockRejectedValue(new Error(''));

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-testid="dq-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-error"]').text()).toContain('Unable to load');
    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(false);
  });
});

describe('DataQualityApp empty states', () => {
  it('renders an empty block, not an alert, when no job has ever run', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(null);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="atlas-feedback"]').exists()).toBe(false);
  });

  it('renders an empty block when the finished run produced no results', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('COMPLETED'));
    vi.mocked(getDataQualityOverview).mockResolvedValue(null);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(true);
  });

  it('asks for a data source, and stays off the network, when the header has none selected', async () => {
    const wrapper = mountApp({ datasetId: ref('') });
    await flushPromises();

    expect(wrapper.find('[data-testid="dq-empty"]').text()).toContain('Select a data source');
    expect(getLatestDataQualityFlowRun).not.toHaveBeenCalled();
  });

  it('keeps a danger alert for a failed job, which is an outcome rather than emptiness', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('FAILED'));

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-testid="atlas-feedback"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(false);
  });

  it('keeps a warning alert for a cancelled job, for the same reason', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('CANCELLED'));

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-testid="atlas-feedback"]').text()).toContain('cancelled');
    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-error"]').exists()).toBe(false);
  });
});

describe('DataQualityApp polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('swaps the progress indicator for the results once the job finishes', async () => {
    vi.mocked(getLatestDataQualityFlowRun)
      .mockResolvedValueOnce(flowRun('RUNNING'))
      .mockResolvedValue(flowRun('COMPLETED'));
    vi.mocked(getDataQualityOverview).mockResolvedValue(overviewResults());

    const wrapper = mountApp();
    await settle();
    expect(wrapper.find('[data-testid="dq-job-progress"]').exists()).toBe(true);

    await settle(POLL_MS);

    expect(wrapper.find('[data-testid="dq-overview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-job-progress"]').exists()).toBe(false);
  });

  it('keeps reading a CANCELLING run, which Prefect has not finished cancelling', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('CANCELLING'));

    mountApp();
    await settle();
    await settle(POLL_MS);

    expect(getLatestDataQualityFlowRun).toHaveBeenCalledTimes(2);
  });

  it('stops reading once the run has reached an outcome', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('CANCELLED'));

    mountApp();
    await settle();
    await settle(POLL_MS * 3);

    expect(getLatestDataQualityFlowRun).toHaveBeenCalledTimes(1);
  });

  it('leaves the running job on screen when a single background poll fails', async () => {
    vi.mocked(getLatestDataQualityFlowRun)
      .mockResolvedValueOnce(flowRun('RUNNING'))
      .mockRejectedValueOnce(new Error('gateway blip'))
      .mockResolvedValue(flowRun('RUNNING'));

    const wrapper = mountApp();
    await settle();
    await settle(POLL_MS);

    expect(wrapper.find('[data-testid="dq-job-state"]').text()).toBe('RUNNING');
    expect(wrapper.find('[data-testid="dq-error"]').exists()).toBe(false);

    // The poll survived the failure, so the job is still being watched.
    await settle(POLL_MS);
    expect(getLatestDataQualityFlowRun).toHaveBeenCalledTimes(3);
  });

  it('reports the failure once the polls stop coming back at all', async () => {
    vi.mocked(getLatestDataQualityFlowRun)
      .mockResolvedValueOnce(flowRun('RUNNING'))
      .mockRejectedValue(new Error('gateway down'));

    const wrapper = mountApp();
    await settle();
    await settle(POLL_MS * (POLL_FAILURE_TOLERANCE + 1));

    expect(wrapper.find('[data-testid="dq-error"]').exists()).toBe(true);
  });
});

describe('DataQualityApp host token', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('waits for the host token instead of reporting an unauthenticated first paint as a failure', async () => {
    let token = '';
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(null);

    const wrapper = mountApp({ getToken: async () => token });
    await settle();

    expect(wrapper.findComponent(AtlasSkeleton).exists()).toBe(true);
    expect(getLatestDataQualityFlowRun).not.toHaveBeenCalled();

    token = 'late-token';
    await settle(AUTH_RETRY_MS);

    expect(getLatestDataQualityFlowRun).toHaveBeenCalledWith('dataset-1', 'late-token');
    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(true);
  });

  it('sends the request anyway once patience runs out, so the gateway answer is what gets reported', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockRejectedValue(new Error('401 Unauthorized'));

    const wrapper = mountApp({ getToken: async () => '' });
    await settle();
    await settle(AUTH_RETRY_MS * 25);

    expect(getLatestDataQualityFlowRun).toHaveBeenCalledWith('dataset-1', '');
    expect(wrapper.find('[data-testid="dq-error"]').exists()).toBe(true);
  });

  it('treats a rejecting getToken as a token that has not arrived yet', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(null);

    const wrapper = mountApp({ getToken: async () => Promise.reject(new Error('logto down')) });
    await settle();

    expect(wrapper.findComponent(AtlasSkeleton).exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-error"]').exists()).toBe(false);
  });
});

describe('DataQualityApp localisation', () => {
  it('renders copy through the host translation function', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(null);

    const wrapper = mountApp({ t: (key: string) => `[${key}]` });
    await flushPromises();

    expect(wrapper.find('[data-testid="dq-empty"]').text()).toBe('[plugins.dataQuality.noRun]');
  });
});
