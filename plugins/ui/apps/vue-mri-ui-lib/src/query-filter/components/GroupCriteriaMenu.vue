<script lang="ts">
export default {
  name: 'GroupCriteriaMenu',
}
</script>

<script setup lang="ts">
import Popper from '@/components/Popper.vue'
import ButtonMaterial from './ButtonMaterial.vue'
import DropdownMenu from './DropdownMenu.vue'
import { ref, computed, watch } from 'vue'

interface Props {
  target: HTMLElement
  namePrefix: string
  groupCriteria?: QueryFilterGroupCriteria
}

type GroupCriteriaType = 'ALL' | 'ANY' | 'AT_LEAST' | 'AT_MOST'

interface QueryFilterGroupCriteria {
  type: GroupCriteriaType
  count?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateGroupCriteriaField: [value: QueryFilterGroupCriteria]
}>()

// Static options
const occurrenceCountOptions = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '20', '50', '100']

// Component refs for Popper
const countDropdownRef = ref<HTMLElement | null>(null)

// State variables
const activeGroupCriteriaType = ref<GroupCriteriaType>(props.groupCriteria?.type || 'ALL')
const currentCount = ref(props.groupCriteria?.count?.toString() || '1')

// Watch for prop changes to sync state
watch(
  () => props.groupCriteria,
  newGroupCriteria => {
    if (newGroupCriteria) {
      activeGroupCriteriaType.value = newGroupCriteria.type || 'ALL'
      currentCount.value = newGroupCriteria.count?.toString() || '1'
    }
  },
  { immediate: false, deep: true }
)

// Show count dropdown only for AT_LEAST and AT_MOST
const showCountDropdown = computed(() => {
  return activeGroupCriteriaType.value === 'AT_LEAST' || activeGroupCriteriaType.value === 'AT_MOST'
})

const isActiveGroupCriteriaType = (type: GroupCriteriaType) => {
  return activeGroupCriteriaType.value === type
}

// Updates
const updateGroupCriteriaField = () => {
  const newGroupCriteria: QueryFilterGroupCriteria = {
    type: activeGroupCriteriaType.value,
  }

  // Only include count for AT_LEAST and AT_MOST
  if (activeGroupCriteriaType.value === 'AT_LEAST' || activeGroupCriteriaType.value === 'AT_MOST') {
    newGroupCriteria.count = parseInt(getGroupCriteriaCount(), 10)
  }

  emit('updateGroupCriteriaField', newGroupCriteria)
}

const updateCountState = (value: string) => {
  currentCount.value = value
}

const updateActiveGroupCriteriaType = (type: GroupCriteriaType) => {
  activeGroupCriteriaType.value = type
}

const getGroupCriteriaCount = () => {
  return currentCount.value
}
</script>

<template>
  <Popper :target="target" placement="bottom-end" class="group-criteria-menu-popper">
    <template #default="{ hide }">
      <div class="popover-content">
        <div class="group-criteria-menu">
          <div class="body">
            <div class="group-criteria-menu__container">
              <!-- Button Layout Container -->
              <div class="button-layout-container">
                <!-- Segmented Button Group -->
                <div class="segmented-button-group">
                  <button
                    class="segment-button segment-button--all"
                    :class="{ 'segment-button--selected': isActiveGroupCriteriaType('ALL') }"
                    @click="updateActiveGroupCriteriaType('ALL')"
                  >
                    All
                  </button>
                  <button
                    class="segment-button segment-button--any"
                    :class="{ 'segment-button--selected': isActiveGroupCriteriaType('ANY') }"
                    @click="updateActiveGroupCriteriaType('ANY')"
                  >
                    Any
                  </button>
                  <button
                    class="segment-button segment-button--at-least"
                    :class="{ 'segment-button--selected': isActiveGroupCriteriaType('AT_LEAST') }"
                    @click="updateActiveGroupCriteriaType('AT_LEAST')"
                  >
                    At least
                  </button>
                  <button
                    class="segment-button segment-button--at-most segment-button--last"
                    :class="{ 'segment-button--selected': isActiveGroupCriteriaType('AT_MOST') }"
                    @click="updateActiveGroupCriteriaType('AT_MOST')"
                  >
                    At most
                  </button>
                </div>

                <!-- Count Dropdown - Always reserve space -->
                <div class="count-dropdown-container">
                  <div v-show="showCountDropdown" class="count-dropdown" ref="countDropdownRef">
                    {{ currentCount }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="footer">
            <ButtonMaterial
              @button-click="
                () => {
                  updateGroupCriteriaField()
                  hide()
                }
              "
            >
              OK
            </ButtonMaterial>
          </div>
        </div>
      </div>
    </template>
  </Popper>

  <!-- Count dropdown menu -->
  <DropdownMenu
    v-if="countDropdownRef && showCountDropdown"
    :options="occurrenceCountOptions"
    @select="(value: string) => updateCountState(value)"
    :target="countDropdownRef"
  />
</template>

<style lang="scss" scoped>
.group-criteria-menu-popper.popper {
  z-index: 1000;
  background-color: transparent;

  .popover-content {
    overflow-y: visible !important; // Override Popper's inline style to prevent shadow clipping
  }
}

.group-criteria-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  min-width: 400px;
  padding: 16px;

  .body {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .button-layout-container {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      height: 36px; // Fixed height to prevent changes
    }

    .segmented-button-group {
      display: flex;
      align-items: center;
      flex: 1;
    }

    .segment-button {
      flex: 1;
      height: 36px;
      border: 3px solid transparent; // Always reserve 3px border space
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      box-sizing: border-box; // Ensure border is included in width calculation

      // Background colors as specified
      &--all {
        background: var(--color-cardinality-all);
        color: white;
      }

      &--any {
        background: var(--color-cardinality-any);
        color: white;
      }

      &--at-least {
        background: var(--color-cardinality-at-least);
        color: white;
      }

      &--at-most {
        background: var(--color-cardinality-at-most);
        color: white;
      }

      // Remove gaps between buttons
      &:first-child {
        border-top-left-radius: 6px;
        border-bottom-left-radius: 6px;
      }

      &--last {
        border-top-right-radius: 6px;
        border-bottom-right-radius: 6px;
      }

      &:not(:first-child) {
        margin-left: -3px; // Overlap by border width to connect buttons
      }

      // Selection state with 3px border
      &--selected {
        border: 3px solid var(--d2e-color-primary, #000080);
        font-weight: 600;
        z-index: 2;

        // Adjust background opacity when selected
        &.segment-button--all {
          background: var(--color-cardinality-all);
        }

        &.segment-button--any {
          background: var(--color-cardinality-any);
        }

        &.segment-button--at-least {
          background: var(--color-cardinality-at-least);
        }

        &.segment-button--at-most {
          background: var(--color-cardinality-at-most);
        }
      }

      &:hover:not(.segment-button--selected) {
        opacity: 0.8;
      }
    }

    .count-dropdown-container {
      min-width: 60px; // Reserve space to prevent layout shift
      height: 36px; // Match button height
      display: flex;
      justify-content: center;
      align-items: center; // Center vertically
    }

    .count-dropdown {
      width: 50px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--d2e-color-primary, #000080);
      border-radius: 4px;
      background: #fff;
      color: var(--d2e-color-primary, #000080);
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: #f8f9fa;
      }
    }
  }

  .footer {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px 0 0;
    border-top: 1px solid #e0e0e0;

    .material-button {
      padding: 0 34px;
    }
  }
}
</style>
