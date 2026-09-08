<script lang="ts">
export default {
  name: 'ObservationPeriodBlock',
}
</script>

<script setup lang="ts">
import { ref, watch } from 'vue'
import DropdownMenu from './DropdownMenu.vue'

type DayType = 'before' | 'after'
type PeriodType = 'PRIOR' | 'POST'

interface Props {
  priorDays?: number
  postDays?: number
}

const props = withDefaults(defineProps<Props>(), {
  priorDays: 0,
  postDays: 0,
})

const emit = defineEmits<{
  'update-entry-days': [type: PeriodType, value: number]
}>()

const daysBefore = ref<number>(props.priorDays)
const daysAfter = ref<number>(props.postDays)
const boxBefore = ref<HTMLElement | null>(null)
const boxAfter = ref<HTMLElement | null>(null)

const dayOptions: string[] = ['0', '1', '7', '14', '21', '30', '60', '90', '120', '180', '365', '548', '730', '1095']

const selectDay = (type: DayType, value: string): void => {
  if (type === 'before') {
    daysBefore.value = parseInt(value, 10)
  } else if (type === 'after') {
    daysAfter.value = parseInt(value, 10)
  }
}

watch(
  () => props.priorDays,
  (newValue?: number) => {
    daysBefore.value = newValue || 0
  }
)

watch(
  () => props.postDays,
  (newValue?: number) => {
    daysAfter.value = newValue || 0
  }
)

watch(daysBefore, (newValue: number) => {
  emit('update-entry-days', 'PRIOR', newValue)
})

watch(daysAfter, (newValue: number) => {
  emit('update-entry-days', 'POST', newValue)
})
</script>

<template>
  <div class="obs-period">
    <div class="obs-period__container">
      <div class="obs-period__row obs-period__header">Continuous Observation Period</div>

      <div class="obs-period__row">
        observation period of at least
        <div class="box" ref="boxBefore">
          <span class="day-digit">{{ daysBefore }}</span>
        </div>
        <span>days before</span> <br />
      </div>

      <div class="obs-period__row">
        and
        <div class="box" ref="boxAfter">
          <span class="day-digit">{{ daysAfter }}</span>
        </div>
        days after event
      </div>
    </div>

    <DropdownMenu
      v-if="boxBefore"
      :options="dayOptions"
      @select="(value: string) => selectDay('before', value)"
      :target="boxBefore"
    />
    <DropdownMenu
      v-if="boxAfter"
      :options="dayOptions"
      @select="(value: string) => selectDay('after', value)"
      :target="boxAfter"
    />
  </div>
</template>

<style scoped lang="scss">
.obs-period {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--d2e-color-primary, #000080);
  &__container {
    display: flex;
    flex-direction: column;
  }
  &__row {
    display: flex;
    align-items: center;
    margin-bottom: 2px;
    font-size: 12px;
  }
  &__header {
    font-size: 12px;
    font-weight: 500;
  }
  .box {
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 20px;
    height: 20px;
    border: 1px solid var(--d2e-color-primary, #000080);
    border-radius: 4px;
    margin: -4px 4px;
    text-align: center;
    line-height: 30px;
    font-size: 12px;
    font-weight: 500;
    color: var(--d2e-color-primary, #000080);
    cursor: pointer;
    .day-digit {
      padding: 0 2px;
    }
  }
}
</style>
