<script lang="ts">
export default {
  name: 'CardinalityMenu',
}
</script>

<script setup lang="ts">
import Popper from '@/components/Popper.vue'
import ButtonMaterial from './ButtonMaterial.vue'
import DropdownMenu from './DropdownMenu.vue'
import { ref } from 'vue'
import GroupButtons from './GroupButtons.vue'
import { QueryFilterCardinality } from '../types/QueryFilterTypes'

interface Props {
  type: 'GROUP' | 'EVENT'
  target: HTMLElement
  namePrefix: string
  cardinality?: QueryFilterCardinality
}

type OccurrenceType = 'EXACTLY' | 'AT_LEAST' | 'AT_MOST'
type OccurrenceCountColumn = 'ALL' | 'DISTINCT_CONCEPT' | 'DISTINCT_START_DATE' | 'DISTINCT_VISIT'

const props = defineProps<Props>()

const emit = defineEmits<{
  updateCardinalityField: [value: QueryFilterCardinality]
}>()

// Static options
const occurrenceCountOptions = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '20', '50', '100']
const occurrenceCountColumnOptions = [
  { value: 'ALL', label: 'All' },
  { value: 'DISTINCT_CONCEPT', label: 'Distinct concept' },
  { value: 'DISTINCT_START_DATE', label: 'Distinct start date' },
  { value: 'DISTINCT_VISIT', label: 'Distinct visit date' },
]

// Component refs for Popper
const countDropdownRef = ref<HTMLElement | null>(null)

// State variables
const activeOccurrenceType = ref<OccurrenceType>(props.cardinality?.type || 'AT_LEAST')
const exactlyCount = ref(props.cardinality?.type === 'EXACTLY' ? props.cardinality.count.toString() : '1')
const atLeastCount = ref(props.cardinality?.type === 'AT_LEAST' ? props.cardinality.count.toString() : '1')
const atMostCount = ref(props.cardinality?.type === 'AT_MOST' ? props.cardinality.count.toString() : '1')
const occurrenceCountColumn = ref<OccurrenceCountColumn>(props.cardinality?.using || 'ALL')

const isGroup = props.type === 'GROUP'
const isActiveOccurrenceType = (type: OccurrenceType) => {
  return activeOccurrenceType.value === type
}

// Updates
const updateCardinalityField = () => {
  const newCardinality = {
    type: activeOccurrenceType.value,
    count: parseInt(getCardinalityCount()),
    using: occurrenceCountColumn.value,
  }
  emit('updateCardinalityField', newCardinality)
}

const updateCountState = (type: 'EXACTLY' | 'AT_LEAST' | 'AT_MOST' | 'COUNT_COL', value: string) => {
  switch (type) {
    case 'EXACTLY':
      exactlyCount.value = value
      break
    case 'AT_LEAST':
      atLeastCount.value = value
      break
    case 'AT_MOST':
      atMostCount.value = value
      break
  }
}

const isValidOccurrenceCountColumn = (value: string): value is OccurrenceCountColumn => {
  return ['ALL', 'DISTINCT_CONCEPT', 'DISTINCT_START_DATE', 'DISTINCT_VISIT'].includes(value)
}

const updateOccurrenceCountColumn = (value: string) => {
  occurrenceCountColumn.value = isValidOccurrenceCountColumn(value) ? value : 'ALL'
}

const updateActiveOccurrenceType = (type: OccurrenceType) => {
  activeOccurrenceType.value = type
}

const getCardinalityCount = () => {
  switch (activeOccurrenceType.value) {
    case 'EXACTLY':
      return exactlyCount.value
    case 'AT_LEAST':
      return atLeastCount.value
    case 'AT_MOST':
      return atMostCount.value
    default:
      return '1'
  }
}
</script>

<template>
  <Popper :target="target" placement="bottom-end" class="cardinality-menu-popper">
    <template #default="{ hide }">
      <div class="popover-content">
        <div class="cardinality-menu">
          <div class="body">
            <div v-if="isGroup" class="cardinality-menu__group">
              <div class="group-button-container"></div>
            </div>

            <div v-else class="cardinality-menu__event">
              <!-- Button Layout Container -->
              <div class="button-layout-container">
                <!-- Segmented Button Group -->
                <div class="segmented-button-group">
                  <button
                    class="segment-button segment-button--exactly"
                    :class="{ 'segment-button--selected': isActiveOccurrenceType('EXACTLY') }"
                    @click="updateActiveOccurrenceType('EXACTLY')"
                  >
                    Exactly
                  </button>
                  <button
                    class="segment-button segment-button--at-least"
                    :class="{ 'segment-button--selected': isActiveOccurrenceType('AT_LEAST') }"
                    @click="updateActiveOccurrenceType('AT_LEAST')"
                  >
                    At least
                  </button>
                  <button
                    class="segment-button segment-button--at-most segment-button--last"
                    :class="{ 'segment-button--selected': isActiveOccurrenceType('AT_MOST') }"
                    @click="updateActiveOccurrenceType('AT_MOST')"
                  >
                    At most
                  </button>
                </div>

                <!-- Count Dropdown - Always reserve space -->
                <div class="count-dropdown-container">
                  <div class="count-dropdown" ref="countDropdownRef">
                    {{ getCardinalityCount() }}
                  </div>
                </div>
              </div>

              <!-- Occurrence Count Column Options -->
              <div class="occurrence-column-container">
                <GroupButtons
                  :options="occurrenceCountColumnOptions"
                  :limitValue="occurrenceCountColumn"
                  :small="true"
                  :namePrefix="props.namePrefix"
                  @update-limit-value="value => updateOccurrenceCountColumn(value)"
                />
              </div>
            </div>
          </div>
          <div class="footer">
            <ButtonMaterial
              @button-click="
                () => {
                  updateCardinalityField()
                  hide()
                }
              "
              >OK</ButtonMaterial
            >
          </div>
        </div>
      </div>
    </template>
  </Popper>

  <DropdownMenu
    v-if="countDropdownRef"
    :options="occurrenceCountOptions"
    @select="(value: string) => updateCountState(activeOccurrenceType, value)"
    :target="countDropdownRef"
  />
</template>

<style lang="scss" scoped>
.cardinality-menu-popper.popper {
  z-index: 1000;
  background-color: transparent;

  .popover-content {
    overflow-y: visible !important; // Override Popper's inline style to prevent shadow clipping
  }
}
.cardinality-menu {
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
  min-width: 300px;
  padding: 16px;

  .body {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .cardinality-menu__event {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

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

      // Background colors for cardinality types
      &--exactly {
        background: var(--color-cardinality-exactly);
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
        &.segment-button--exactly {
          background: var(--color-cardinality-exactly);
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

    .occurrence-column-container {
      display: flex;
      justify-content: center;
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
