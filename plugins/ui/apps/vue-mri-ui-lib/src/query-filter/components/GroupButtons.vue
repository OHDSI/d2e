<script lang="ts">
export default {
  name: 'GroupButtons',
}
</script>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Option {
  value: string
  label: string
}

interface Props {
  options?: Option[]
  limitValue?: string
  small?: boolean
  namePrefix?: string
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  limitValue: '',
  small: false,
  namePrefix: '',
})

const emit = defineEmits<{
  'update-limit-value': [value: string]
}>()

const selectedOption = ref<string>(props.limitValue || props.options?.[0]?.value || '')

const prefix = props.namePrefix ? `${props.namePrefix}-` : ''
const radioGroupName = `button-radio-${prefix}group`

// Watch for external changes to limitValue
watch(
  () => props.limitValue,
  (newValue?: string) => {
    selectedOption.value = newValue || ''
  }
)

// Emit changes when selection changes
watch(selectedOption, (newValue: string) => {
  emit('update-limit-value', newValue)
})
</script>

<template>
  <div class="group-button">
    <template v-for="(option, index) in options" :key="`${option.value}-${index}-${prefix}`">
      <input
        type="radio"
        class="button-check"
        :name="radioGroupName"
        :id="`input-${option.value}-${index}-${prefix}`"
        v-model="selectedOption"
        :value="option.value"
        autocomplete="off"
      />
      <label
        class="button button-outline-primary"
        :for="`input-${option.value}-${index}-${prefix}`"
        :class="{ active: selectedOption === option.value, small: props.small }"
      >
        {{ option.label }}
      </label>
    </template>
  </div>
</template>

<style scoped>
.group-button {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
  flex-wrap: wrap;
  max-width: 100%;
}

.button-check {
  position: absolute;
  clip: rect(0, 0, 0, 0);
  pointer-events: none;
}

.button {
  position: relative;
  display: inline-block;
  padding: 0.375rem 0.75rem;
  margin-bottom: 0;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  text-align: center;
  text-decoration: none;
  vertical-align: middle;
  cursor: pointer;
  user-select: none;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: 0;
  transition:
    color 0.15s ease-in-out,
    background-color 0.15s ease-in-out,
    border-color 0.15s ease-in-out,
    box-shadow 0.15s ease-in-out;
}

.button:hover {
  text-decoration: none;
}

.button:focus {
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.button-outline-primary {
  color: var(--d2e-color-primary, #000080);
  border-color: var(--d2e-color-primary, #000080);
  background-color: transparent;
}

.button-outline-primary:hover {
  color: #fff;
  background-color: var(--d2e-color-primary, #000080);
  border-color: var(--d2e-color-primary, #000080);
}

.button-outline-primary:focus {
  box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.5);
}

.button-outline-primary.active {
  color: #fff;
  background-color: var(--d2e-color-primary, #000080);
  border-color: var(--d2e-color-primary, #000080);
}

.group-button > .button {
  position: relative;
  flex: 1 1 auto;
}

.group-button > .button:not(:first-child) {
  margin-left: -1px;
}

.group-button > label.button:first-of-type {
  border-top-left-radius: 0.375rem;
  border-bottom-left-radius: 0.375rem;
}
.group-button > label.button:last-of-type {
  border-top-right-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
}

.group-button > .button:hover,
.group-button > .button:focus,
.group-button > .button.active {
  z-index: 1;
}

.group-button > label.button.small {
  font-size: 0.75rem;
}
</style>
