import { cancelPreload, preloadNow, preloadWhenIdle, resetPreloadQueue } from "../preloadScheduler";

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

  it("does not download a plugin whose preload was cancelled", async () => {
    // A plugin can unmount before its turn comes up — a dataset switch
    // remounts the whole researcher container. Downloading it then would
    // compete with whatever the user moved on to.
    const going = deferred();
    const staying = deferred();

    preloadWhenIdle("going", going.load);
    preloadWhenIdle("staying", staying.load);
    cancelPreload("going");

    await advance(IDLE_FALLBACK_MS);

    expect(going.load).not.toHaveBeenCalled();
    expect(staying.load).toHaveBeenCalledTimes(1);
  });

  it("queues one entry per plugin, so a re-register cannot double up", async () => {
    // `generateAppId` derives the id from the path alone, so a plugin that is
    // unregistered and registered again reuses it. Two entries would put two
    // background downloads on the wire.
    const plugin = deferred();

    preloadWhenIdle("plugin", plugin.load);
    preloadWhenIdle("plugin", plugin.load);

    await advance(IDLE_FALLBACK_MS);
    expect(plugin.load).toHaveBeenCalledTimes(1);

    plugin.resolve();
    await flush();
    await advance(IDLE_FALLBACK_MS * 2);
    expect(plugin.load).toHaveBeenCalledTimes(1);
  });

  it("holds background preloads until every foreground preload settles", async () => {
    // Two plugins can both match the current location when their base paths
    // nest. With a boolean flag the first to settle resumed the drain while
    // the second was still on the wire.
    const firstActive = deferred();
    const secondActive = deferred();
    const queued = deferred();

    preloadNow("active-a", firstActive.load);
    preloadNow("active-b", secondActive.load);
    preloadWhenIdle("queued", queued.load);

    firstActive.resolve();
    await flush();
    await advance(IDLE_FALLBACK_MS * 2);
    expect(queued.load).not.toHaveBeenCalled();

    secondActive.resolve();
    await flush();
    await advance(IDLE_FALLBACK_MS);
    expect(queued.load).toHaveBeenCalledTimes(1);
  });
});
