import { inject, onMounted, onUnmounted } from 'vue';
import { DQ_HOST_CTX, type CustomPropsChangedDetail, type DqHostCtx } from '../types';

/**
 * Read the host context main.ts provided, and — in routed-app mode only — keep
 * `datasetId` in sync with the source Atlas3's shell considers current.
 *
 * Atlas3 never remounts the plugin when the user switches data source, and it
 * signals the change differently per mount mode:
 *
 *   parcel (datasource-sidebar) -> `parcel.update({ hostContext })`, handled by
 *                                  the `update` lifecycle in main.ts
 *   routed app (menuItems)      -> a `custom-props-changed` CustomEvent on
 *                                  `window`, handled here
 *
 * The window event is deliberately NOT honoured as a parcel, even though it is
 * addressed to our appId. PluginLoader registers `/plugins/data-quality/` as a
 * route even with an empty `menuItems`, so our id is in single-spa's app list
 * and its source watcher broadcasts to us — but what it broadcasts is
 * `webApiStore.selectedSource || sources[0].sourceKey`, the shell's global
 * "current" source, which on a fresh page load is just the first source in
 * /WebAPI/source/sources. As a parcel we have already been handed the source
 * the /datasources route picked, and that broadcast lands in a race with our
 * mount: when it landed last it replaced the route's dataset with the first
 * one, and the dashboard reported "no data quality job has run" for a source
 * the user had not opened. The route's answer is the authoritative one here.
 *
 * Every loaded plugin receives every event, hence the appId filter as well.
 */
export function useHostContext(): DqHostCtx {
  const ctx = inject<DqHostCtx>(DQ_HOST_CTX);
  if (!ctx) {
    throw new Error('data-quality: host context missing; was the plugin mounted by Atlas?');
  }

  const onPropsChanged = (event: Event): void => {
    const detail = (event as CustomEvent<CustomPropsChangedDetail>).detail;
    if (!detail || detail.appId !== ctx.appId) return;
    if (typeof detail.datasetId === 'string' && detail.datasetId !== ctx.datasetId.value) {
      ctx.datasetId.value = detail.datasetId;
    }
  };

  onMounted(() => {
    if (!ctx.isRoutedApp) return;
    window.addEventListener('custom-props-changed', onPropsChanged);
  });
  onUnmounted(() => window.removeEventListener('custom-props-changed', onPropsChanged));

  return ctx;
}
