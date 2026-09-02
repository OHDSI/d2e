<template>
  <div class="app-date form-group">
    <app-label v-if="text" :text="text" />
    <div
      class="d-flex form-control form-control-sm date-container"
      :class="{ invalidDate: !isValid || errMsg, MriHilite: isActive && isValid, activeError: isActive && !isValid }"
    >
      <div class="app-date__trigger">
        <input
          v-model="displayValue"
          :placeholder="placeholder"
          :class="inputClasses"
          :readonly="false"
          :tabindex="0"
          @keyup.enter="onKeyEnter"
          @focus="onInputFocus"
          @blur="onInputBlur"
          @input="clearError"
        />
        <div ref="calendarButton" class="app-date__icon" @click="togglePicker">
          <appIcon icon="calendar" />
        </div>
      </div>

      <!-- Hidden VueDatePicker for calendar functionality -->
      <VueDatePicker
        ref="datepicker"
        v-bind="datePickerProps"
        @update:model-value="onValueUpdate"
        @closed="onClosed"
        @cleared="onCleared"
        class="dp-hidden-input"
        :dark="false"
      />
    </div>
    <div v-if="!isValid || errMsg" class="error-container">
      <span class="errortext">{{ errMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import VueDatePicker from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import moment from 'moment'
import appIcon from './app-icon.vue'
import appLabel from './app-label.vue'
import { useStore } from 'vuex'

const store = useStore()
// Component configuration
defineOptions({
  name: 'AppDate',
})

// Props
interface Props {
  date?: Date | string | null
  config?: {
    format?: string
    inline?: boolean
    enableTime?: boolean
    range?: boolean
    [key: string]: any
  }
  text?: string
  placeholder?: string
  datetype?: string
  errMsg?: string
  disabled?: boolean
  clearable?: boolean
  autoApply?: boolean
  textInput?: boolean
  configFormat?: string // Optional date format from MRI config
}

const props = withDefaults(defineProps<Props>(), {
  date: null,
  config: () => ({
    format: 'YYYY-MM-DD',
    inline: false,
  }),
  text: '',
  placeholder: '',
  datetype: '',
  errMsg: '',
  disabled: false,
  clearable: true,
  autoApply: true,
  textInput: true,
  configFormat: undefined,
})

// Emits
const emit = defineEmits<{
  update: [{ date: Date | string | null; isEmpty: boolean }]
}>()

// Inline utility functions
const momentToDateFnsFormat = (momentFormat: string): string => {
  return momentFormat
    .replace(/YYYY/g, 'yyyy')
    .replace(/DD/g, 'dd')
    .replace(/MM/g, 'MM')
    .replace(/HH/g, 'HH')
    .replace(/mm/g, 'mm')
    .replace(/ss/g, 'ss')
}

const parseDateString = (value: string): Date | null => {
  const parsedMoment = moment(
    value,
    [mergedConfig.value.format, 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', moment.ISO_8601],
    true
  )
  if (parsedMoment.isValid()) {
    return parsedMoment.toDate()
  }

  const fallbackDate = new Date(value)
  return !isNaN(fallbackDate.getTime()) ? fallbackDate : null
}

const isDate = (value: unknown): boolean => {
  if (value instanceof Date) {
    return !isNaN(value.getTime())
  }
  if (typeof value === 'string') {
    return parseDateString(value) !== null
  }
  return false
}

const normalizeValue = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) {
    return isDate(value) ? value : null
  }
  if (typeof value === 'string') {
    return parseDateString(value)
  }
  return null
}

// Reactive state
const internalValue = ref<Date | string | null>(null)
const displayValue = ref('')
const isValid = ref(true)
const isActive = ref(false)
const tempDate = ref<Date | string | null>(null)
const datepicker = ref()
const errMsg = computed(() => props.errMsg || (isValid.value ? '' : store.getters['getText']('MRI_PA_INVALID_DATE')))

// Computed properties
const defaultConfig = computed(() => ({
  format: 'YYYY-MM-DD',
  inline: false,
  enableTime: false,
  range: false,
}))

const mergedConfig = computed(() => {
  return {
    ...defaultConfig.value,
    ...props.config,
    format: props.configFormat || 'YYYY-MM-DD',
  }
})

const displayFormat = computed(() => {
  const format = mergedConfig.value.format
  return momentToDateFnsFormat(format)
})

const enableTime = computed(() => {
  const format = mergedConfig.value.format
  return format.includes('HH:mm') || format.includes('HH:mm:ss') || mergedConfig.value.enableTime
})

const isRange = computed(() => mergedConfig.value.range)

const keepActionRow = computed(() => !props.autoApply || enableTime.value)

const inputClasses = computed(() => [
  'mr-auto',
  {
    invalidDate: !isValid.value || props.errMsg,
  },
])

const customUI = computed(() => ({
  input: 'dp-custom-input',
  inputIcon: 'dp-custom-input-icon',
  menu: 'dp-custom-menu',
  calendar: 'dp-custom-calendar',
  calendarCell: 'dp-custom-cell',
  calendarCellSelected: 'dp-custom-cell-selected',
  calendarHeader: 'dp-custom-header',
  timePicker: 'dp-custom-time',
}))

const datePickerProps = computed(() => ({
  modelValue: internalValue.value,
  format: displayFormat.value,
  enableTimePicker: enableTime.value,
  timePickerInline: enableTime.value,
  startTime: { hours: 0, minutes: 0, seconds: 0 },
  range: isRange.value,
  disabled: props.disabled,
  clearable: props.clearable,
  closeOnScroll: false,
  autoApply: props.autoApply,
  teleport: 'body',
  inline: false,
  ui: customUI.value,
  keepActionRow: keepActionRow.value,
  menuClassName: 'app-date-menu',
  textInput: props.textInput
    ? {
        format: mergedConfig.value.format,
        enterSubmit: true,
        tabSubmit: true,
        selectOnFocus: true,
      }
    : false,
}))

// Methods
const updateInternalValue = (date: Date | string | null) => {
  if (date instanceof Date && !isNaN(date.getTime())) {
    internalValue.value = date
  } else if (typeof date === 'string' && date.trim() !== '') {
    const parsedDate = parseDateString(date)
    if (parsedDate) {
      internalValue.value = parsedDate
    } else {
      internalValue.value = date
    }
  } else {
    internalValue.value = null
  }
}

const updateDisplayValue = (value: Date | string | null) => {
  if (value instanceof Date && !isNaN(value.getTime())) {
    displayValue.value = moment(value).format(mergedConfig.value.format)
  } else if (typeof value === 'string' && value.trim() !== '') {
    const parsedDate = parseDateString(value)
    if (!isActive.value && parsedDate) {
      displayValue.value = moment(parsedDate).format(mergedConfig.value.format)
    } else {
      displayValue.value = value
    }
  } else {
    displayValue.value = ''
  }
}

// Watch for prop changes
watch(
  () => props.date,
  newDate => {
    updateInternalValue(newDate)
  },
  { immediate: true }
)

watch(
  internalValue,
  newValue => {
    updateDisplayValue(newValue)
  },
  { immediate: true }
)

const onValueUpdate = (value: Date | string | null) => {
  const normalizedValue = normalizeValue(value)

  const hasHydratedSourceDate =
    (props.date instanceof Date && !isNaN(props.date.getTime())) ||
    (typeof props.date === 'string' && props.date.trim() !== '' && parseDateString(props.date) !== null)

  if (!isActive.value && normalizedValue === null && hasHydratedSourceDate && internalValue.value instanceof Date) {
    return
  }

  internalValue.value = normalizedValue

  if (normalizedValue) {
    isValid.value = true
    emit('update', { date: normalizedValue, isEmpty: false })
  } else {
    isValid.value = true
    emit('update', { date: '', isEmpty: true })
  }
}

const onInputFocus = () => {
  isActive.value = true
  tempDate.value = props.date
}

const onInputBlur = () => {
  isActive.value = false

  // Compare what user typed vs what was there when they focused
  const formattedTempDate = tempDate.value ? moment(tempDate.value).format(mergedConfig.value.format) : ''

  // Only commit if the value actually changed
  if (displayValue.value !== formattedTempDate) {
    if (displayValue.value !== '') {
      commitDate(displayValue.value)
    } else {
      // User cleared the field
      emit('update', { date: '', isEmpty: true })
    }
  }
}

const onKeyEnter = (event: KeyboardEvent) => {
  const target = event.target as HTMLInputElement
  commitDate(target.value)
}

const commitDate = (dateVal: string) => {
  if (dateVal === '') {
    isValid.value = true
    emit('update', { date: '', isEmpty: true })
  } else {
    const momentDate = moment(dateVal, mergedConfig.value.format, true)
    if (momentDate.isValid()) {
      isValid.value = true
      const date = momentDate.toDate()
      internalValue.value = date
      emit('update', { date, isEmpty: false })
    } else {
      isValid.value = false
    }
  }
}

const onClosed = () => {
  isActive.value = false
}

const onCleared = () => {
  internalValue.value = null
  displayValue.value = ''
  isValid.value = true
  emit('update', { date: '', isEmpty: true })
}

const clearError = () => {
  isValid.value = true
}

const togglePicker = () => {
  if (datepicker.value) {
    datepicker.value.openMenu()
  }
}

// Expose methods for compatibility
defineExpose({
  focus: () => {
    if (datepicker.value) {
      datepicker.value.focus()
    }
  },
  openMenu: () => {
    if (datepicker.value) {
      datepicker.value.openMenu()
    }
  },
  closeMenu: () => {
    if (datepicker.value) {
      datepicker.value.closeMenu()
    }
  },
})
</script>

<style lang="scss" scoped>
.app-date {
  .date-container {
    position: relative;
    padding: 0;

    .app-date__trigger {
      display: flex;
      align-items: center;
      width: 100%;

      input {
        flex: 1;
        border: none;
        outline: none;
        padding: 0.375rem 0.75rem;
        background: transparent;

        &::placeholder {
          color: #6c757d;
        }

        &:focus {
          outline: none;
        }
      }

      .app-date__icon {
        padding: 0.375rem 0.75rem;
        cursor: pointer;
        color: #6c757d;

        &:hover {
          color: #495057;
        }
      }
    }

    &.invalidDate {
      border-color: var(--color-mri-error);
    }

    &.MriHilite {
      border-color: var(--color-app-date-border, #007bff);
      box-shadow: 0 0 0 0.2rem var(--color-app-date-highlight, rgba(0, 123, 255, 0.25));
    }

    &.activeError {
      border-color: var(--color-mri-error);
      box-shadow: 0 0 0 0.1rem var(--color-mri-error);
    }
  }

  .error-container {
    margin-top: 0.25rem;
    margin-left: 0.25rem;
    height: 1rem;
    position: relative;
    .errortext {
      color: var(--color-mri-error);
      font-size: 0.7rem;
    }
  }
}
</style>

<!-- Global styles for @vuepic/vue-datepicker customization. In unscoped scss for it to apply-->
<style lang="scss">
// Hide the VueDatePicker input but keep the menu functionality
.dp-hidden-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 1px;
  height: 1px;
}

.dp__theme_light {
  --dp-text-color: var(--d2e-color-primary, #000080);
  --dp-hover-color: #d2d2d2;
  --dp-primary-color: var(--d2e-color-primary, #000080);
  .dp__today {
    border: 2.5px solid var(--color-app-date-today, #ff5e59);
    border-radius: 5px;
    color: #ffffff;
    background: var(--d2e-color-primary, #000080);
  }
  .dp__tp_inline_btn_top,
  .dp__tp_inline_btn_bottom {
    &:hover {
      .dp__tp_inline_btn_bar {
        background: var(--d2e-color-primary, #000080);
      }
    }
  }
}
</style>
