import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { createVuetify } from 'vuetify';
import { AtlasSkeleton } from '@ohdsi/atlas-ui';
import DataQualityApp from './DataQualityApp.vue';
import { DQ_HOST_CTX, type DqHostCtx } from './types';
import {
  getDataQualityOverview,
  getLatestDataQualityFlowRun,
  type FlowRun,
  type FlowRunStateType,
} from './api/dqd';

// Only the HTTP boundary is faked; the real composable drives every state below,
// so these assert on what the dashboard actually does rather than on a stub.
vi.mock('./api/dqd', () => ({
  getLatestDataQualityFlowRun: vi.fn(),
  getDataQualityOverview: vi.fn(),
}));

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

beforeEach(() => {
  vi.mocked(getLatestDataQualityFlowRun).mockReset();
  vi.mocked(getDataQualityOverview).mockReset();
});

// The in-progress branch starts a poll; unmounting stops it so it cannot leak
// into the next test.
afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount();
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

  it('keeps a danger alert for a failed job, which is an outcome rather than emptiness', async () => {
    vi.mocked(getLatestDataQualityFlowRun).mockResolvedValue(flowRun('FAILED'));

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('[data-testid="atlas-feedback"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-empty"]').exists()).toBe(false);
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
