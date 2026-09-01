import { preloadNow, preloadWhenIdle, resetPreloadQueue } from "../preloadScheduler";

// Force the setTimeout fallback so the tests drive the scheduler with fake
// timers rather than depending on a jsdom requestIdleCallback.
const IDLE_FALLBACK_MS = 500;

const flush = async () => {
  // Let already-resolved promise callbacks run between timer advances.
  await Promise.resolve();
  await Promise.resolve();
};

const advance = async (ms: number) => {
  jest.advanceTimersByTime(ms);
  await flush();
};

/** A load function whose promise this test resolves by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  const load = jest.fn(() => promise);
  return { load, resolve, reject };
}

describe("preloadScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetPreloadQueue();
    delete (window as any).requestIdleCallback;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads the active plugin straight away", () => {
    const active = deferred();
    preloadNow("active", active.load);
    expect(active.load).toHaveBeenCalledTimes(1);
  });

  it("does not start a queued preload immediately", async () => {
    const queued = deferred();
    preloadWhenIdle("queued", queued.load);

    expect(queued.load).not.toHaveBeenCalled();

    await advance(IDLE_FALLBACK_MS);
    expect(queued.load).toHaveBeenCalledTimes(1);
  });

  it("holds background preloads until the active one settles", async () => {
    const active = deferred();
    const queued = deferred();

    preloadNow("active", active.load);
    preloadWhenIdle("queued", queued.load);

    // The active bundle is still in flight, so nothing else may compete.
    await advance(IDLE_FALLBACK_MS * 4);
    expect(queued.load).not.toHaveBeenCalled();

    active.resolve();
    await flush();
    await advance(IDLE_FALLBACK_MS);
    expect(queued.load).toHaveBeenCalledTimes(1);
  });

  it("drains the queue one bundle at a time", async () => {
    const first = deferred();
    const second = deferred();

    preloadWhenIdle("first", first.load);
    preloadWhenIdle("second", second.load);

    await advance(IDLE_FALLBACK_MS);
    expect(first.load).toHaveBeenCalledTimes(1);
    expect(second.load).not.toHaveBeenCalled();

    first.resolve();
    await flush();
    await advance(IDLE_FALLBACK_MS);
    expect(second.load).toHaveBeenCalledTimes(1);
  });

  it("keeps draining after a preload fails", async () => {
    const failing = deferred();
    const next = deferred();

    preloadWhenIdle("failing", failing.load);
    preloadWhenIdle("next", next.load);

    await advance(IDLE_FALLBACK_MS);
    expect(failing.load).toHaveBeenCalledTimes(1);

    failing.reject(new Error("network"));
    await flush();
    await advance(IDLE_FALLBACK_MS);
    expect(next.load).toHaveBeenCalledTimes(1);
  });
});
