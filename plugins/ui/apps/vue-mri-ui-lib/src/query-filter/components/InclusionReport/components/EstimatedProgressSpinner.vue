<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import VProgressCircular from '@/components/vuetify/VProgressCircular.vue'

const props = withDefaults(
  defineProps<{
    size?: number
    stroke?: number
    trickleMs?: number
    loading?: boolean
    finishMs?: number
    expectedDurationMs?: number
  }>(),
  { size: 48, stroke: 4, trickleMs: 200, loading: true, finishMs: 350 }
)

const emit = defineEmits<{ (e: 'finished'): void }>()

const progress = ref(0)
let trickleTimer: ReturnType<typeof setTimeout> | null = null
let finishTimer: ReturnType<typeof setTimeout> | null = null

const TICKS_TO_FULL = 63

const effectiveTrickleMs = computed(() => {
  if (props.expectedDurationMs && props.expectedDurationMs > 0) {
    return Math.max(20, Math.round(props.expectedDurationMs / TICKS_TO_FULL))
  }
  return props.trickleMs
})

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function increment(n: number) {
  if (n < 0.2) return 0.1
  if (n < 0.5) return 0.04
  if (n < 0.8) return 0.02
  if (n < 0.994) return 0.005
  return 0
}

function trickle() {
  const inc = increment(progress.value)
  if (inc === 0) return
  progress.value = clamp(progress.value + inc, 0, 0.994)
  if (progress.value < 0.994) {
    trickleTimer = setTimeout(trickle, effectiveTrickleMs.value)
  }
}

function startTrickle() {
  if (trickleTimer) clearTimeout(trickleTimer)
  if (finishTimer) clearTimeout(finishTimer)
  finishTimer = null
  progress.value = 0
  trickleTimer = setTimeout(trickle, effectiveTrickleMs.value)
}

function finish() {
  if (trickleTimer) clearTimeout(trickleTimer)
  trickleTimer = null
  progress.value = 1
  if (finishTimer) clearTimeout(finishTimer)
  finishTimer = setTimeout(() => emit('finished'), props.finishMs)
}

const percent = computed(() => Math.floor(progress.value * 100))

onMounted(() => {
  if (props.loading) startTrickle()
  else finish()
})

watch(
  () => props.loading,
  newVal => {
    if (newVal) startTrickle()
    else finish()
  }
)

onUnmounted(() => {
  if (trickleTimer) clearTimeout(trickleTimer)
  if (finishTimer) clearTimeout(finishTimer)
})
</script>

<template>
  <VProgressCircular class="estimated-progress-spinner" :model-value="percent" :size="size" :width="stroke">
    <span class="label">{{ percent }}%</span>
  </VProgressCircular>
</template>

<style scoped lang="scss">
.estimated-progress-spinner {
  color: var(--d2e-color-primary, #000080);

  :deep(.v-progress-circular__underlay) {
    stroke: var(--color-ui-light-border, #e0e0e0);
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
}
</style>
