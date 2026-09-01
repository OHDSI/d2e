/**
 * Schedules plugin bundle preloads so the active plugin is not starved.
 *
 * The researcher container pre-renders a container for every `type: "app"`
 * plugin, so `registerSingleSpaApp` runs for all of them on the same tick. An
 * unconditional eager preload therefore put six bundles on the wire together.
 *
 * On a constrained link that starves the plugin the user actually asked for.
 * Measured at 4 Mbit/s with six bundles in flight, vue-mri's 1,036 KB entry
 * took 8,935 ms, an effective 116 KB/s out of the 500 KB/s the link allows.
 *
 * The plugin whose route is already active still preloads immediately, which
 * is what closes the LOADING_SOURCE_CODE race that the eager preload was added
 * for. Every other plugin is queued and drained one at a time while the browser
 * is idle, so at most one background download competes with the foreground one.
 *
 * Deferring is only an optimisation. If the user opens a plugin before its
 * queued preload has run, single-spa calls the app's load function on
 * activation and the module cache dedupes the two callers.
 */

type PreloadTask = { id: string; load: () => Promise<unknown> };

const queue: PreloadTask[] = [];
let draining = false;
// True while the active plugin's bundle is downloading. Background preloads
// wait for it, so the plugin the user opened gets the whole link.
let foregroundInFlight = false;

const IDLE_TIMEOUT_MS = 5000;
const FALLBACK_DELAY_MS = 500;

function whenIdle(run: () => void): void {
  const idle = (window as any).requestIdleCallback;
  if (typeof idle === "function") {
    idle(() => run(), { timeout: IDLE_TIMEOUT_MS });
    return;
  }
  window.setTimeout(run, FALLBACK_DELAY_MS);
}

function drain(): void {
  if (foregroundInFlight) {
    // A foreground preload started while we were waiting for idle. Stand down;
    // preloadNow restarts the drain once it settles.
    draining = false;
    return;
  }

  const next = queue.shift();
  if (!next) {
    draining = false;
    return;
  }

  console.debug(`[preloadScheduler] ${next.id} - background preload`);
  // Chain the next task on settle, not on success, so one failing bundle does
  // not strand the rest of the queue.
  next
    .load()
    .catch(() => undefined)
    .then(() => whenIdle(drain));
}

/**
 * Preload immediately. Use for the plugin whose route is already active.
 *
 * Background preloads start only once this one settles, so the active plugin
 * gets the whole link rather than sharing it.
 */
export function preloadNow(id: string, load: () => Promise<unknown>): void {
  console.debug(`[preloadScheduler] ${id} - foreground preload`);
  foregroundInFlight = true;
  // Fire and forget. A failure here is surfaced later by single-spa when it
  // calls the load function through its own lifecycle.
  load()
    .catch((error) => {
      console.debug(`[preloadScheduler] ${id} - preload failed (will retry on activation):`, error);
    })
    .then(() => {
      foregroundInFlight = false;
      startDraining();
    });
}

/** Queue a preload to run in the background, one bundle at a time. */
export function preloadWhenIdle(id: string, load: () => Promise<unknown>): void {
  queue.push({ id, load });
  startDraining();
}

function startDraining(): void {
  if (draining || foregroundInFlight) return;
  draining = true;
  whenIdle(drain);
}

/** Test seam: drop anything still queued. */
export function resetPreloadQueue(): void {
  queue.length = 0;
  draining = false;
  foregroundInFlight = false;
}
