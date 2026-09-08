<script setup lang="ts">
import { useStore } from 'vuex'
import type { Summary } from '@/query-filter/types/InclusionReportTypes'

defineProps<{
  summary: Summary
}>()

const store = useStore()
const getText = (key: string, param?: string | string[]) => store.getters.getText(key, param)
</script>

<template>
  <div class="summary-section">
    <h4>{{ getText('MRI_PA_INCLUSION_REPORT_SUMMARY_STATISTICS') }}</h4>
    <div class="summary-data">
      <p>{{ getText('MRI_PA_INCLUSION_REPORT_TOTAL_PERSONS') }}: {{ summary.baseCount.toLocaleString() }}</p>
      <p>
        {{ getText('MRI_PA_INCLUSION_REPORT_MATCHES') }}: {{ summary.finalCount.toLocaleString() }} ({{
          summary.percentMatched
        }})
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.summary-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  color: var(--d2e-color-primary, #000080);
}
.summary-data {
  display: flex;
  gap: 2rem;
}
</style>
