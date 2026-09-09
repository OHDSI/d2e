<template>
  <!-- role="alert": this replaces content the user asked to see, and there is
       no other signal that it failed. -->
  <div class="lazy-load-error" role="alert" data-testid="lazy-load-error">
    <p class="lazy-load-error__message">{{ getText('MRI_PA_CHART_LOAD_ERROR') }}</p>
    <button type="button" class="lazy-load-error__retry" @click="reload">
      {{ getText('MRI_PA_COLL_BUT_RETRY') }}
    </button>
  </div>
</template>

<script lang="ts">
import { mapGetters } from 'vuex'

/**
 * Shown when a lazily loaded component's chunk cannot be fetched.
 *
 * The charts load on demand so the chart libraries stay out of the entry
 * bundle, which means each one is a network dependency at runtime. The most
 * likely cause of a failure is a stale document asking for a chunk hash that a
 * new deployment has replaced, and a full reload is the only fix for that — the
 * retry hook in `lazyComponent` has already given up by the time this renders.
 */
export default {
  name: 'lazyLoadError',
  computed: {
    ...mapGetters(['getText']),
  },
  methods: {
    reload(): void {
      window.location.reload()
    },
  },
}
</script>

<style scoped lang="scss">
.lazy-load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 24px;
  text-align: center;
}

.lazy-load-error__message {
  margin: 0;
  font-size: 0.875rem;
  color: var(--d2e-color-text-secondary, #5b6771);
}

.lazy-load-error__retry {
  padding: 6px 16px;
  font-size: 0.875rem;
  color: var(--d2e-color-white, #ffffff);
  cursor: pointer;
  background: var(--d2e-color-primary, #003d5b);
  border: none;
  border-radius: 6px;
}
</style>
