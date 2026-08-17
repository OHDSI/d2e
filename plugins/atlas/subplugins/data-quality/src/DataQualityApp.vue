<script setup lang="ts">
/**
 * Phase A stub. Renders nothing but the host wiring it depends on, so a failure
 * here is unambiguously a plumbing failure rather than a UI one. Replaced by the
 * real dashboard in Phase C.
 */
import { computed } from 'vue';
import { useHostContext } from './composables/useHostContext';

const ctx = useHostContext();
const datasetId = computed(() => ctx.datasetId.value);

// uiFilesUrl is supplied by PluginLoader (routed) and not by parcelLoader, so it
// tells us which way Atlas mounted us. Shown here purely to make the Phase A
// gate self-evident.
const mountMode = computed(() =>
  ctx.uiFilesUrl ? 'routed app (menuItems)' : 'parcel (datasource-sidebar)'
);
</script>

<template>
  <div class="dq-stub">
    <h1 class="dq-stub__title">Data quality</h1>
    <dl class="dq-stub__facts">
      <dt>sourceKey</dt>
      <dd data-testid="dq-dataset-id">{{ datasetId || '(none — no data source selected)' }}</dd>
      <dt>mount mode</dt>
      <dd data-testid="dq-mount-mode">{{ mountMode }}</dd>
      <dt>appId</dt>
      <dd>{{ ctx.appId }}</dd>
      <dt>locale</dt>
      <dd>{{ ctx.locale }}</dd>
    </dl>
    <p class="dq-stub__note">
      Phase A skeleton — the dashboard UI lands in Phase C.
    </p>
  </div>
</template>

<style scoped>
.dq-stub {
  padding: 24px;
  font-family: 'IBM Plex Sans', sans-serif;
}

.dq-stub__title {
  font-size: 34px;
  font-weight: 600;
  letter-spacing: -1px;
  margin: 0 0 24px;
}

.dq-stub__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  margin: 0 0 16px;
  font-size: 14px;
}

.dq-stub__facts dt {
  font-weight: 600;
}

.dq-stub__facts dd {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}

.dq-stub__note {
  font-size: 14px;
  opacity: 0.7;
}
</style>
