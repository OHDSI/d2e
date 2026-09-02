<script lang="ts">
export default {
  name: 'Tooltip',
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import InfoIcon from './icons/InfoIcon.vue'

interface Props {
  /**
   * Configuration object mapping tooltip keys to their text content
   */
  tooltipConfig: Record<string, string>
  /**
   * The current active tooltip key
   */
  activeKey: string | null
  /**
   * Whether to show the tooltip (conditional rendering)
   */
  show?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  show: true,
})

// Tooltip state management (moved from useTooltip composable)
const activeTooltip = ref<string | null>(null)
let tooltipTimer: ReturnType<typeof setTimeout> | null = null

const showTooltip = (type: string) => {
  if (tooltipTimer) clearTimeout(tooltipTimer)
  activeTooltip.value = type
}

const hideTooltip = () => {
  if (tooltipTimer) clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => {
    activeTooltip.value = null
  }, 100) // Small delay to prevent flickering
}

const currentTooltipText = computed(() => {
  return activeTooltip.value ? props.tooltipConfig[activeTooltip.value] : ''
})

const isTooltipVisible = (type: string) => {
  return activeTooltip.value === type
}

// Check if we should show tooltip for the active key
const shouldShowForActiveKey = computed(() => {
  return props.show && props.activeKey && props.tooltipConfig[props.activeKey]
})

// Handle tooltip interactions
const handleMouseEnter = () => {
  if (props.activeKey) {
    showTooltip(props.activeKey)
  }
}

const handleMouseLeave = () => {
  hideTooltip()
}
</script>

<template>
  <div v-if="shouldShowForActiveKey" class="tooltip-container">
    <div class="info-icon-wrapper" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
      <InfoIcon class="info-icon" />
    </div>
    <div
      v-show="activeKey && isTooltipVisible(activeKey)"
      class="tooltip-content"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      {{ currentTooltipText }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tooltip-container {
  position: absolute;
  right: -32px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1001;

  .info-icon-wrapper {
    display: flex;
    align-items: center;
    padding: 6px;

    .info-icon {
      color: #666;
      transition: color 0.2s ease;
      display: block;

      &:hover {
        color: var(--d2e-color-primary, #000080);
      }
    }
  }

  .tooltip-content {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(51, 51, 51, 0.95);
    backdrop-filter: blur(4px);
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
    width: 450px;
    z-index: 1002;
    text-align: left;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);

    // Arrow pointing up
    &::before {
      content: '';
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 8px solid transparent;
      border-bottom-color: rgba(51, 51, 51, 0.95);
    }

    // Small arrow border for better visibility
    &::after {
      content: '';
      position: absolute;
      bottom: calc(100% + 1px);
      left: 50%;
      transform: translateX(-50%);
      border: 7px solid transparent;
      border-bottom-color: rgba(255, 255, 255, 0.1);
    }
  }
}
</style>
