<script lang="ts">
export default {
  name: 'ButtonMaterial',
}
</script>

<script setup lang="ts">
import { ref, computed, useSlots } from 'vue'

type Variant = 'contained' | 'outlined' | 'text'
type Color = 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'
type Size = 'small' | 'medium' | 'large'

interface Props {
  variant?: Variant
  color?: Color
  size?: Size
  disabled?: boolean
  fullWidth?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'contained',
  color: 'primary',
  size: 'medium',
  disabled: false,
  fullWidth: false,
})

const emit = defineEmits<{
  'button-click': [event: MouseEvent]
}>()
const slots = useSlots()

const isPressed = ref<boolean>(false)

const hasStartIcon = computed<boolean>(() => !!slots['startIcon'])
const hasEndIcon = computed<boolean>(() => !!slots['endIcon'])

const handleMouseDown = (): void => {
  if (!props.disabled) {
    isPressed.value = true
  }
}

const handleMouseUp = (): void => {
  isPressed.value = false
}

const handleMouseLeave = (): void => {
  isPressed.value = false
}

const handleClick = (event: MouseEvent): void => {
  if (!props.disabled) {
    emit('button-click', event)
  }
}

const buttonClasses = computed<string[]>(() => {
  const classes = ['material-button']

  classes.push(`material-button--${props.variant}`)
  classes.push(`material-button--${props.color}`)
  classes.push(`material-button--${props.size}`)

  if (props.disabled) classes.push('material-button--disabled')
  if (isPressed.value) classes.push('material-button--pressed')
  if (props.fullWidth) classes.push('material-button--full-width')

  return classes
})
</script>

<template>
  <button
    :class="buttonClasses"
    :disabled="disabled"
    @click.prevent="handleClick"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <slot name="startIcon"></slot>
    <span v-if="$slots['default']" :class="{ 'button-text': hasStartIcon || hasEndIcon }">
      <slot></slot>
    </span>
    <slot name="endIcon"></slot>
  </button>
</template>

<style scoped>
.material-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'Roboto', 'Helvetica', 'Arial', sans-serif;
  font-weight: 500;
  line-height: 1.75;
  letter-spacing: 0.02857em;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  outline: none;
  transition:
    background-color 250ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 250ms cubic-bezier(0.4, 0, 0.2, 1),
    color 250ms cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  vertical-align: middle;
  appearance: none;
  text-decoration: none;
  min-width: 64px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

/* Sizes */
.material-button--small {
  padding: 4px 10px;
  font-size: 0.8125rem;
  min-height: 30px;
}

.material-button--medium {
  padding: 6px 16px;
  font-size: 0.875rem;
  min-height: 36px;
}

.material-button--large {
  padding: 8px 22px;
  font-size: 0.9375rem;
  min-height: 42px;
}

/* Variants */
.material-button--contained {
  box-shadow:
    0px 3px 1px -2px rgba(0, 0, 0, 0.2),
    0px 2px 2px 0px rgba(0, 0, 0, 0.14),
    0px 1px 5px 0px rgba(0, 0, 0, 0.12);
}

.material-button--contained:hover {
  box-shadow:
    0px 2px 4px -1px rgba(0, 0, 0, 0.2),
    0px 4px 5px 0px rgba(0, 0, 0, 0.14),
    0px 1px 10px 0px rgba(0, 0, 0, 0.12);
}

.material-button--contained.material-button--pressed {
  box-shadow:
    0px 5px 5px -3px rgba(0, 0, 0, 0.2),
    0px 8px 10px 1px rgba(0, 0, 0, 0.14),
    0px 3px 14px 2px rgba(0, 0, 0, 0.12);
}

.material-button--outlined {
  border: 1px solid;
  background-color: transparent;
}

.material-button--text {
  background-color: transparent;
  border: none;
  box-shadow: none;
  font-weight: 600;
}

/* Colors - Contained */
.material-button--contained.material-button--primary {
  background-color: var(--d2e-color-primary, #000080);
  color: #fff;
}

.material-button--contained.material-button--primary:hover {
  background-color: var(--color-primary-light);
}

.material-button--contained.material-button--secondary {
  background-color: #ffa19d;
  color: var(--d2e-color-primary, #000080);
}

.material-button--contained.material-button--secondary:hover {
  background-color: var(--color-secondary, #ff5e59);
}

.material-button--contained.material-button--error {
  background-color: #d32f2f;
  color: #fff;
}

.material-button--contained.material-button--error:hover {
  background-color: #c62828;
}

.material-button--contained.material-button--success {
  background-color: #999fcb;
  color: #fff;
}

.material-button--contained.material-button--success:hover {
  background-color: #333399;
}

.material-button--contained.material-button--warning {
  background-color: #ed6c02;
  color: #fff;
}

.material-button--contained.material-button--warning:hover {
  background-color: #e65100;
}

.material-button--contained.material-button--info {
  background-color: #0288d1;
  color: #fff;
}

.material-button--contained.material-button--info:hover {
  background-color: #0277bd;
}

/* Colors - Outlined */
.material-button--outlined.material-button--primary {
  border-color: #1976d2;
  color: #1976d2;
}

.material-button--outlined.material-button--primary:hover {
  background-color: rgba(25, 118, 210, 0.04);
  border-color: #1976d2;
}

.material-button--outlined.material-button--secondary {
  border-color: #dc004e;
  color: #dc004e;
}

.material-button--outlined.material-button--secondary:hover {
  background-color: rgba(220, 0, 78, 0.04);
  border-color: #dc004e;
}

.material-button--outlined.material-button--error {
  border-color: #d32f2f;
  color: #d32f2f;
}

.material-button--outlined.material-button--error:hover {
  background-color: rgba(211, 47, 47, 0.04);
  border-color: #d32f2f;
}

.material-button--outlined.material-button--success {
  border-color: #2e7d32;
  color: #2e7d32;
}

.material-button--outlined.material-button--success:hover {
  background-color: rgba(46, 125, 50, 0.04);
  border-color: #2e7d32;
}

.material-button--outlined.material-button--warning {
  border-color: #ed6c02;
  color: #ed6c02;
}

.material-button--outlined.material-button--warning:hover {
  background-color: rgba(237, 108, 2, 0.04);
  border-color: #ed6c02;
}

.material-button--outlined.material-button--info {
  border-color: #0288d1;
  color: #0288d1;
}

.material-button--outlined.material-button--info:hover {
  background-color: rgba(2, 136, 209, 0.04);
  border-color: #0288d1;
}

/* Colors - Text */
.material-button--text.material-button--primary {
  color: var(--d2e-color-primary, #000080);
}

.material-button--text.material-button--primary:hover {
  background-color: rgba(88, 87, 87, 0.05);
}

.material-button--text.material-button--secondary {
  color: #dc004e;
}

.material-button--text.material-button--secondary:hover {
  background-color: rgba(220, 0, 78, 0.04);
}

.material-button--text.material-button--error {
  color: #d32f2f;
}

.material-button--text.material-button--error:hover {
  background-color: rgba(211, 47, 47, 0.04);
}

.material-button--text.material-button--success {
  color: #2e7d32;
}

.material-button--text.material-button--success:hover {
  background-color: rgba(46, 125, 50, 0.04);
}

.material-button--text.material-button--warning {
  color: #ed6c02;
}

.material-button--text.material-button--warning:hover {
  background-color: rgba(237, 108, 2, 0.04);
}

.material-button--text.material-button--info {
  color: #0288d1;
}

.material-button--text.material-button--info:hover {
  background-color: rgba(2, 136, 209, 0.04);
}

/* Disabled state */
.material-button--disabled {
  color: rgba(0, 0, 0, 0.26) !important;
  box-shadow: none !important;
  background-color: rgba(0, 0, 0, 0.12) !important;
  cursor: default !important;
  pointer-events: none !important;
}

.material-button--outlined.material-button--disabled {
  border-color: rgba(0, 0, 0, 0.26) !important;
  background-color: transparent !important;
}

.material-button--text.material-button--disabled {
  background-color: transparent !important;
}

/* Full width */
.material-button--full-width {
  width: 100%;
}

/* Pressed state */
.material-button--pressed {
  transform: scale(0.98);
}

/* Icon spacing */
.material-button :deep(svg) {
  width: 1.8em;
  height: 1.8em;
  fill: currentColor;
}

.material-button--small :deep(svg) {
  width: 1em;
  height: 1em;
}

.material-button--large :deep(svg) {
  width: 1.8em;
  height: 1.8em;
}

.button-text {
  margin-left: 8px;
  margin-right: 8px;
}

.material-button--small .button-text {
  margin-left: 6px;
  margin-right: 6px;
}

.material-button--large .button-text {
  margin-left: 10px;
  margin-right: 10px;
}
</style>
