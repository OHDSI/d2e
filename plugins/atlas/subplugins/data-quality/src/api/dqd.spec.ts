import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDataQualityOverview, getLatestDataQualityFlowRun } from './dqd';

const getToken = async () => 'token';

function respond(init: { status: number; body?: string; statusText?: string }): Response {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: init.statusText ?? '',
    text: async () => init.body ?? '',
  } as Response;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getLatestDataQualityFlowRun', () => {
  it('reports a failed request in words the user can act on, not an HTTP status line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ status: 500, statusText: 'Internal Server Error' })));

    await expect(getLatestDataQualityFlowRun('dataset-1', getToken)).rejects.toThrow(
      'Unable to load data quality results. Please try again.',
    );
  });

  it('keeps the status line in the console so the failure stays diagnosable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ status: 500, statusText: 'Internal Server Error' })));

    await expect(getLatestDataQualityFlowRun('dataset-1', getToken)).rejects.toThrow();

    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).toContain('dataset-1');
    expect(logged).toContain('500');
  });

  it('still reads a 404 as "nothing recorded yet" rather than a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ status: 404 })));

    await expect(getLatestDataQualityFlowRun('dataset-1', getToken)).resolves.toBeNull();
  });
});

describe('getDataQualityOverview', () => {
  it('reports a failed request in words the user can act on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ status: 503, statusText: 'Service Unavailable' })));

    await expect(getDataQualityOverview('run-1', 'dataset-1', getToken)).rejects.toThrow(
      'Unable to load data quality results. Please try again.',
    );
  });

  it('still returns null when a completed run wrote no artifact', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ status: 200, body: '' })));

    await expect(getDataQualityOverview('run-1', 'dataset-1', getToken)).resolves.toBeNull();
  });
});
