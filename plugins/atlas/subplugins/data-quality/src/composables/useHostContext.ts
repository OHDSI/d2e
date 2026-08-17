import { inject, onMounted, onUnmounted } from 'vue';
import { DQ_HOST_CTX, type CustomPropsChangedDetail, type DqHostCtx } from '../types';

/**
 * Read the host context main.ts provided, and keep `datasetId` in sync with the
 * source selected in the Atlas header.
 *
 * Atlas3 never remounts the plugin when the user switches data source, and it
 * signals the change differently per mount mode:
 *
 *   parcel (datasource-sidebar) -> `parcel.update({ hostContext })`, handled by
 *                                  the `update` lifecycle in main.ts
 *   routed app (menuItems)      -> a `custom-props-changed` CustomEvent on
 *                                  `window`, handled here
 *
 * We currently ship as a parcel, so this listener is the secondary path — kept
 * because PluginLoader still registers `/plugins/data-quality/` as a route even
 * with an empty `menuItems`. Every loaded plugin receives every event, hence the
 * appId filter.
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

  onMounted(() => window.addEventListener('custom-props-changed', onPropsChanged));
  onUnmounted(() => window.removeEventListener('custom-props-changed', onPropsChanged));

  return ctx;
}
