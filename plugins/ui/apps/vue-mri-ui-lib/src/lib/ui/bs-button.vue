<template>
  <button @click="handleClick" :class="buttonClasses" :disabled="disabled">
    <slot></slot>
  </button>
</template>

<script lang="ts">
export default {
  name: 'BsButton',
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  size?: '' | 'sm' | 'lg'
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'light' | 'dark' | 'link'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: '',
  variant: 'primary',
  disabled: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const buttonClasses = computed(() => {
  const classes = ['btn']

  // Add variant class
  if (props.variant) {
    classes.push(`btn-${props.variant}`)
  }

  // Add size class
  if (props.size) {
    classes.push(`btn-${props.size}`)
  }

  return classes
})

const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
/* Base button styles */
.btn {
  display: inline-block;
  font-weight: 400;
  text-align: center;
  vertical-align: middle;
  user-select: none;
  border: var(--border-width-s, 1px) solid transparent;
  padding: 0.375rem 0.75rem;
  font-size: 1rem;
  line-height: 1.5;
  border-radius: var(--border-radius-xs, 0.25rem);
  transition:
    color 0.15s ease-in-out,
    background-color 0.15s ease-in-out,
    border-color 0.15s ease-in-out,
    box-shadow 0.15s ease-in-out;
  cursor: pointer;
  font-family: var(--font-family-secondary, inherit);
  text-decoration: none;
  overflow: visible;
  text-transform: none;
  -webkit-appearance: button;
  appearance: button;
  box-sizing: border-box;
  margin: 0;
  position: relative;
}

.btn:focus {
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* Primary variant */
.btn-primary {
  color: var(--color-text-button-primary-default, #fff);
  background-color: var(--color-background-button-primary-default, var(--d2e-color-primary, #000080));
  border-color: var(--color-border-button-primary-default, var(--d2e-color-primary, #000080));
}

.btn-primary:hover {
  color: var(--color-text-button-primary-hover, #fff);
  background-color: var(--color-background-button-primary-hover, var(--color-primary-light, #0056b3));
  border-color: var(--color-border-button-primary-hover, var(--color-primary-light, #0056b3));
}

.btn-primary:active {
  color: var(--color-text-button-primary-active, #fff);
  background-color: var(--color-background-button-primary-active, var(--color-primary-light, #0056b3));
  border-color: var(--color-border-button-primary-active, var(--color-primary-light, #0056b3));
}

.btn-primary:disabled {
  color: var(--color-text-button-primary-disabled, #fff);
  background-color: var(--color-background-button-primary-disabled, var(--color-primary-extra-lightest, #e9ecef));
  border-color: var(--color-border-button-primary-disabled, var(--color-primary-extra-lightest, #e9ecef));
}

/* Secondary variant */
.btn-secondary {
  color: var(--color-text-button-secondary-default, var(--d2e-color-primary, #000080));
  background-color: var(--color-background-button-secondary-default, transparent);
  border-color: var(--color-border-button-secondary-default, var(--d2e-color-primary, #000080));
}

.btn-secondary:hover {
  color: var(--color-text-button-secondary-hover, var(--d2e-color-primary, #000080));
  background-color: var(--color-background-button-secondary-hover, var(--color-neutral-lightest, #f8f9fa));
  border-color: var(--color-border-button-secondary-hover, var(--d2e-color-primary, #000080));
}

.btn-secondary:active {
  color: var(--color-text-button-secondary-active, var(--d2e-color-primary, #000080));
  background-color: var(--color-background-button-secondary-active, var(--color-neutral-lightest, #f8f9fa));
  border-color: var(--color-border-button-secondary-active, var(--d2e-color-primary, #000080));
}

.btn-secondary:disabled {
  color: var(--color-text-button-secondary-disabled, var(--d2e-color-primary, #000080));
  background-color: var(--color-background-button-secondary-disabled, var(--color-primary-extra-lightest, #e9ecef));
  border-color: var(--color-border-button-secondary-disabled, var(--d2e-color-primary, #000080));
}

/* Success variant */
.btn-success {
  color: #fff;
  background-color: var(--color-feedback-success, #28a745);
  border-color: var(--color-feedback-success, #28a745);
}

.btn-success:hover {
  color: #fff;
  background-color: #218838;
  border-color: #1e7e34;
}

/* Warning variant */
.btn-warning {
  color: #212529;
  background-color: var(--color-support-yellow, #ffc107);
  border-color: var(--color-support-yellow, #ffc107);
}

.btn-warning:hover {
  color: #212529;
  background-color: #e0a800;
  border-color: #d39e00;
}

/* Danger variant */
.btn-danger {
  color: #fff;
  background-color: var(--color-feedback-alarm, #dc3545);
  border-color: var(--color-feedback-alarm, #dc3545);
}

.btn-danger:hover {
  color: #fff;
  background-color: #c82333;
  border-color: #bd2130;
}

/* Info variant */
.btn-info {
  color: #fff;
  background-color: var(--color-support-blue, #17a2b8);
  border-color: var(--color-support-blue, #17a2b8);
}

.btn-info:hover {
  color: #fff;
  background-color: #138496;
  border-color: #117a8b;
}

/* Light variant */
.btn-light {
  color: #212529;
  background-color: var(--color-neutral-lightest, #f8f9fa);
  border-color: var(--color-neutral-lightest, #f8f9fa);
}

.btn-light:hover {
  color: #212529;
  background-color: #e2e6ea;
  border-color: #dae0e5;
}

/* Dark variant */
.btn-dark {
  color: #fff;
  background-color: var(--color-neutral, #343a40);
  border-color: var(--color-neutral, #343a40);
}

.btn-dark:hover {
  color: #fff;
  background-color: #23272b;
  border-color: #1d2124;
}

/* Link variant */
.btn-link {
  color: var(--d2e-color-primary, #000080);
  background-color: transparent;
  border-color: transparent;
  text-decoration: underline;
}

.btn-link:hover {
  color: var(--color-primary-light, #0056b3);
  background-color: transparent;
  border-color: transparent;
  text-decoration: underline;
}

.btn-link:disabled {
  color: #6c757d;
  background-color: transparent;
  border-color: transparent;
}

/* Size variants */
.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  border-radius: var(--border-radius-xs, 0.2rem);
}

.btn-lg {
  padding: 0.5rem 1rem;
  font-size: 1.25rem;
  line-height: 1.5;
  border-radius: var(--border-radius-s, 0.3rem);
}
</style>
