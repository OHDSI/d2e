<script lang="ts">
export default {
  name: 'QueryFilterEntryExit',
}
</script>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { EntryEvent, ExitEvent, QueryFilterEvent } from '../types/QueryFilterTypes'
import type { ConceptSetItemDisplay, ConceptSetDomainValues, ConceptSetAction } from '../types/ConceptSetTypes'
import QueryFilterEventContainer from './QueryFilterEventContainer.vue'
import GroupButtons from './GroupButtons.vue'
import ObservationPeriodBlock from './ObservationPeriodBlock.vue'
import DropdownMenu from './DropdownMenu.vue'
import Tooltip from './Tooltip.vue'
import QueryFilterTagInputAdapter from '../../lib/ui/QueryFilterTagInputAdapter.vue'

interface Props {
  type: 'ENTRY' | 'EXIT'
  primaryEventsData?: EntryEvent
  exitCriteriaData?: ExitEvent
  conceptSets?: ConceptSetItemDisplay[]
  conceptSetDomainValues?: ConceptSetDomainValues
  conceptSetTexts?: Record<string, string>
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  conceptSets: () => [],
  readonly: false,
})

const emit = defineEmits<{
  'update-limit': [limit: 'ALL' | 'EARLIEST' | 'LATEST' | 'CONT_OBS' | 'FIXED' | 'CONT_DRUG']
  'update-entry-days': [type: 'PRIOR' | 'POST', days: number]
  'concept-set-action': [action: ConceptSetAction]
  'update-fixed-duration': [eventDateOffset: 'StartDate' | 'EndDate', daysOffset: number]
  'update-cont-drug-settings': [
    conceptSetId: string,
    conceptSetName: string,
    gapDays: number,
    offset: number,
    daysSupplyOverride: number,
  ]
  'update-primary-events': [events: QueryFilterEvent[]]
  'update-exit-events': [events: QueryFilterEvent[]]
  'search-change': [searchQuery: string]
}>()

const title = computed(() => (props.type === 'ENTRY' ? 'Cohort Entry Events' : 'Cohort Exit'))

const updateLimitValue = (value: string) => {
  // Type guard to ensure the value is valid
  const validLimits = ['ALL', 'EARLIEST', 'LATEST', 'CONT_OBS', 'FIXED', 'CONT_DRUG'] as const
  type ValidLimit = (typeof validLimits)[number]

  const isValidLimit = (val: string): val is ValidLimit => {
    return validLimits.includes(val as ValidLimit)
  }

  if (isValidLimit(value)) {
    emit('update-limit', value)

    // Only emit settings when user actively switches mode (not during initialization)
    // Check if the value is different from current prop to detect user action
    const currentStrategy = props.exitCriteriaData?.endStrategy
    const isUserAction = currentStrategy && currentStrategy !== value

    if (!isEntry.value && isUserAction) {
      if (value === 'FIXED') {
        emit('update-fixed-duration', selectedEventDateOffset.value, selectedDaysOffset.value)
      } else if (value === 'CONT_DRUG') {
        emit(
          'update-cont-drug-settings',
          selectedConceptSet.value?.value.toString() || '',
          selectedConceptSet.value?.text || selectedConceptSet.value?.display_value || '',
          selectedGapDays.value,
          selectedOffset.value,
          selectedDaysSupplyOverride.value
        )
      }
    }
  }
}
const updateEntryDaysValue = (type: 'PRIOR' | 'POST', days: number) => {
  emit('update-entry-days', type, days)
}

const initialEventsLimitOptions = [
  { value: 'EARLIEST', label: 'Earliest' },
  { value: 'ALL', label: 'All' },
  { value: 'LATEST', label: 'Latest' },
]

const exitEventPersistenceOptions = [
  { value: 'CONT_OBS', label: 'Continuous observation' },
  { value: 'FIXED', label: 'Fixed duration to initial event' },
  { value: 'CONT_DRUG', label: 'Continuous drug exposure' },
]

const buttonOptions = computed(() => {
  return props.type === 'ENTRY' ? initialEventsLimitOptions : exitEventPersistenceOptions
})

const isEntry = computed(() => props.type === 'ENTRY')

const initialEventsLimit = computed(() => {
  if (isEntry.value) {
    return props.primaryEventsData?.primaryCriteriaLimit || 'ALL'
  } else {
    return props.exitCriteriaData?.endStrategy || 'CONT_OBS'
  }
})

const priorDays = computed(() => {
  return (isEntry.value && props.primaryEventsData?.priorDays) || 0
})

const postDays = computed(() => {
  return (isEntry.value && props.primaryEventsData?.postDays) || 0
})

const eventsData = computed(() => {
  return isEntry.value ? props.primaryEventsData?.events || [] : props.exitCriteriaData?.censoringCriteria || []
})

const handleEventsUpdate = (updatedEvents: QueryFilterEvent[]) => {
  if (isEntry.value) {
    emit('update-primary-events', updatedEvents)
  } else {
    emit('update-exit-events', updatedEvents)
  }
}

// Fixed duration inputs state and handlers
const eventDateOffsetRef = ref<HTMLElement | null>(null)
const daysOffsetRef = ref<HTMLElement | null>(null)

const eventDateOffsetOptions = [
  { value: 'StartDate', label: 'Start date' },
  { value: 'EndDate', label: 'End date' },
]

const daysOffsetOptions = ['1', '2', '3', '4', '5', '6', '7', '14', '21', '30', '60', '90', '180', '365']

// Default values for fixed duration
const selectedEventDateOffset = ref<'StartDate' | 'EndDate'>('StartDate')
const selectedDaysOffset = ref<number>(30)

// Initialize fixed duration settings from exitCriteriaData when component mounts or data changes
const initializeFixedDurationSettings = () => {
  if (props.exitCriteriaData?.fixedDuration) {
    const settings = props.exitCriteriaData.fixedDuration
    selectedEventDateOffset.value = settings.dateField || 'StartDate'
    selectedDaysOffset.value = settings.offset ?? 30
  }
}

// Show fixed duration inputs only when limit is FIXED and not ENTRY
const showFixedDurationInputs = computed(() => {
  return !isEntry.value && initialEventsLimit.value === 'FIXED'
})

const updateEventDateOffset = (value: string) => {
  if (value === 'StartDate' || value === 'EndDate') {
    selectedEventDateOffset.value = value
    emit('update-fixed-duration', selectedEventDateOffset.value, selectedDaysOffset.value)
  }
}

const updateDaysOffset = (value: string) => {
  const days = parseInt(value, 10)
  if (!isNaN(days)) {
    selectedDaysOffset.value = days
    emit('update-fixed-duration', selectedEventDateOffset.value, selectedDaysOffset.value)
  }
}

// CONT_DRUG inputs state and handlers
const gapDaysRef = ref<HTMLElement | null>(null)
const offsetRef = ref<HTMLElement | null>(null)
const daysSupplyOverrideRef = ref<HTMLElement | null>(null)

// Options for dropdowns
const gapDaysOptions = ['0', '1', '2', '3', '7', '14', '30', '60', '90', '180']
const offsetOptions = ['0', '1', '2', '3', '7', '14', '30', '60', '90', '180']
const daysSupplyOverrideOptions = ['1', '7', '14', '30', '60', '90', '180', '365']

// Default values for CONT_DRUG
const selectedConceptSet = ref<ConceptSetItemDisplay | null>(null)
const selectedGapDays = ref<number>(30)
const selectedOffset = ref<number>(0)
const selectedDaysSupplyOverride = ref<number>(1)

// Initialize CONT_DRUG settings from exitCriteriaData when component mounts or data changes
const initializeContDrugSettings = () => {
  if (props.exitCriteriaData?.contDrugSettings) {
    const settings = props.exitCriteriaData.contDrugSettings

    // Set numeric values
    selectedGapDays.value = settings.gapDays ?? 30
    selectedOffset.value = settings.offset ?? 0
    selectedDaysSupplyOverride.value = settings.daysSupplyOverride ?? 1

    // Find and set the concept set from the available concept sets
    if (settings.conceptSetId && props.conceptSets) {
      const conceptSet = props.conceptSets.find(cs => cs.value.toString() === settings.conceptSetId)
      if (conceptSet) {
        selectedConceptSet.value = conceptSet
      }
    }
  }
}

// Initialize on mount
onMounted(() => {
  initializeFixedDurationSettings()
  initializeContDrugSettings()
})

// Watch for changes to exitCriteriaData.fixedDuration and re-initialize
watch(
  () => props.exitCriteriaData?.fixedDuration,
  () => {
    initializeFixedDurationSettings()
  },
  { deep: true, immediate: true }
)

// Watch for changes to exitCriteriaData.contDrugSettings and re-initialize
watch(
  () => props.exitCriteriaData?.contDrugSettings,
  () => {
    initializeContDrugSettings()
  },
  { deep: true, immediate: true }
)

// Also watch for conceptSets to become available (they may load after the component mounts)
watch(
  () => props.conceptSets,
  () => {
    // Re-initialize to pick up the concept set once it's loaded
    if (props.exitCriteriaData?.contDrugSettings?.conceptSetId && !selectedConceptSet.value) {
      initializeContDrugSettings()
    }
  },
  { deep: true }
)

// Show CONT_DRUG inputs only when limit is CONT_DRUG and not ENTRY
const showContDrugInputs = computed(() => {
  return !isEntry.value && initialEventsLimit.value === 'CONT_DRUG'
})

// Handle concept set changes for CONT_DRUG
const handleContDrugConceptSetChange = (values: ConceptSetItemDisplay[]) => {
  if (!values || values.length === 0) {
    selectedConceptSet.value = null
  } else {
    selectedConceptSet.value = values[0] // Only support one concept set
  }
  emitContDrugUpdate()
}

// Create tag input model for concept set selection
const contDrugTagInputModel = computed(() => ({
  id: `cont-drug-concept-set-${Date.now()}`,
  props: {
    type: 'conceptSet',
    value: selectedConceptSet.value ? [selectedConceptSet.value] : [],
    attributePath: 'drug_exposure.concept_id',
    domainFilter: 'Drug',
    standardConceptCodeFilter: 'Standard',
  },
}))

// Get the external value for the tag input
const getContDrugTagInputValue = () => {
  if (selectedConceptSet.value) {
    return [selectedConceptSet.value]
  }
  return []
}

const updateGapDays = (value: string) => {
  const days = parseInt(value, 10)
  if (!isNaN(days)) {
    selectedGapDays.value = days
    emitContDrugUpdate()
  }
}

const updateOffset = (value: string) => {
  const days = parseInt(value, 10)
  if (!isNaN(days)) {
    selectedOffset.value = days
    emitContDrugUpdate()
  }
}

const updateDaysSupplyOverride = (value: string) => {
  const days = parseInt(value, 10)
  if (!isNaN(days)) {
    selectedDaysSupplyOverride.value = days
    emitContDrugUpdate()
  }
}

const emitContDrugUpdate = () => {
  const conceptSetId = selectedConceptSet.value?.value.toString() || ''
  const conceptSetName = selectedConceptSet.value?.text || selectedConceptSet.value?.display_value || ''

  emit(
    'update-cont-drug-settings',
    conceptSetId,
    conceptSetName,
    selectedGapDays.value,
    selectedOffset.value,
    selectedDaysSupplyOverride.value
  )
}

// Tooltip configuration
const tooltipConfig = {
  FIXED: `The event end date is derived from adding a number of days to the event's start or end date. If an offset is added to the event's start date, all cohort episodes will have the same fixed duration (subject to further censoring). If an offset is added to the event's end date, persons in the cohort may have varying cohort duration times due to the varying event durations (such as eras of persistent drug exposure or visit length of stay). This event persistence assures that the cohort end date will be no greater than the selected index event date, plus the days offset.`,
  CONT_DRUG: `Specify a concept set that contains one or more drugs. A drug era will be derived from all drug exposure events for any of the drugs within the concept set, using the specified persistence window as a maximum allowable gap in days between successive exposure events and adding a specified surveillance window to the final exposure event. If no exposure event end date is provided, then an exposure event end date is inferred to be event start date + days supply in cases when days supply is available or event start date + 1 day otherwise. This event persistence assures that the cohort end date will be no greater than the drug era end date.`,
} as const

// Determine which tooltip to show based on current selection
const activeTooltipKey = computed(() => {
  if (!isEntry.value && (initialEventsLimit.value === 'FIXED' || initialEventsLimit.value === 'CONT_DRUG')) {
    return initialEventsLimit.value
  }
  return null
})
</script>

<template>
  <div class="query-filter-entry-exit">
    <div class="criteria-header">
      <div class="criteria-title-container">
        <h3 class="criteria-title">{{ title }}</h3>
      </div>

      <div class="qualifying-events-controls">
        <GroupButtons
          :options="buttonOptions"
          :small="!isEntry"
          :limitValue="initialEventsLimit"
          :namePrefix="type.toLowerCase()"
          @update-limit-value="updateLimitValue"
        />
        <!-- Tooltip for EXIT options -->
        <Tooltip class="exit-tooltip" :tooltip-config="tooltipConfig" :active-key="activeTooltipKey" />
      </div>

      <div class="shadow-container">
        <ObservationPeriodBlock
          v-if="isEntry"
          :priorDays="priorDays"
          :postDays="postDays"
          @update-entry-days="updateEntryDaysValue"
        />
      </div>
    </div>

    <!-- Fixed Duration Inputs for EXIT when FIXED is selected - Below GroupButtons -->
    <div v-if="showFixedDurationInputs" class="fixed-duration-container">
      <div class="fixed-duration-inputs">
        <div class="fixed-input-group">
          <label class="fixed-input-label">Event date to offset from:</label>
          <div class="fixed-dropdown" ref="eventDateOffsetRef">
            {{ eventDateOffsetOptions.find(opt => opt.value === selectedEventDateOffset)?.label || 'Start date' }}
          </div>
        </div>

        <div class="fixed-input-group">
          <label class="fixed-input-label">Number of days offset:</label>
          <div class="fixed-dropdown-with-suffix">
            <div class="fixed-dropdown" ref="daysOffsetRef">
              {{ selectedDaysOffset }}
            </div>
            <span class="fixed-suffix">days</span>
          </div>
        </div>
      </div>
    </div>

    <!-- CONT_DRUG Inputs for EXIT when CONT_DRUG is selected - Below GroupButtons -->
    <div v-if="showContDrugInputs" class="cont-drug-container">
      <div class="cont-drug-inputs">
        <div class="cont-drug-input-group">
          <label class="cont-drug-input-label">Concept set containing the drug(s) of interest:</label>
          <QueryFilterTagInputAdapter
            v-if="!readonly"
            :model="contDrugTagInputModel"
            :external-value="getContDrugTagInputValue()"
            :external-domain-values="
              conceptSetDomainValues || { values: [], isLoading: false, loadedStatus: 'NO_RESULTS' }
            "
            :external-texts="conceptSetTexts || {}"
            :is-catalog-attribute="false"
            :max-selections="1"
            @update:value="handleContDrugConceptSetChange"
          />
          <div v-else class="cont-drug-concept-set-readonly">
            {{ selectedConceptSet?.text || selectedConceptSet?.display_value || 'No concept set selected' }}
          </div>
        </div>

        <div class="cont-drug-input-group">
          <label class="cont-drug-input-label">Persistence window: allow for a maximum of</label>
          <div class="cont-drug-dropdown-with-suffix">
            <div class="cont-drug-dropdown" ref="gapDaysRef">
              {{ selectedGapDays }}
            </div>
            <span class="cont-drug-suffix"
              >days between exposure records when inferring the era of persistence exposure</span
            >
          </div>
        </div>

        <div class="cont-drug-input-group">
          <label class="cont-drug-input-label">Surveillance window: add</label>
          <div class="cont-drug-dropdown-with-suffix">
            <div class="cont-drug-dropdown" ref="offsetRef">
              {{ selectedOffset }}
            </div>
            <span class="cont-drug-suffix"
              >days to the end of the era of persistence exposure as an additional period of surveillance prior to
              cohort exit</span
            >
          </div>
        </div>

        <div class="cont-drug-input-group">
          <label class="cont-drug-input-label">Force drug exposure days supply to:</label>
          <div class="cont-drug-dropdown-with-suffix">
            <div class="cont-drug-dropdown" ref="daysSupplyOverrideRef">
              {{ selectedDaysSupplyOverride }}
            </div>
            <span class="cont-drug-suffix">days</span>
          </div>
        </div>
      </div>
    </div>

    <div class="events-container">
      <div class="sidebar">
        <div class="sidebar-top"></div>
        <div class="sidebar-label">ALL</div>
      </div>
      <QueryFilterEventContainer
        :events="eventsData"
        :event-type="type"
        :concept-sets="props.conceptSets"
        :concept-set-domain-values="
          props.conceptSetDomainValues || { values: [], isLoading: false, loadedStatus: 'NO_RESULTS' }
        "
        :concept-set-texts="props.conceptSetTexts || {}"
        :readonly="readonly"
        @update-events="handleEventsUpdate"
        @search-change="(searchQuery: string) => $emit('search-change', searchQuery)"
        @concept-set-action="(action: ConceptSetAction) => $emit('concept-set-action', action)"
      />
    </div>
  </div>

  <!-- Dropdown menus for Fixed Duration inputs -->
  <DropdownMenu
    v-if="eventDateOffsetRef && showFixedDurationInputs"
    :options="eventDateOffsetOptions.map(opt => opt.value)"
    @select="updateEventDateOffset"
    :target="eventDateOffsetRef"
  />
  <DropdownMenu
    v-if="daysOffsetRef && showFixedDurationInputs"
    :options="daysOffsetOptions"
    @select="updateDaysOffset"
    :target="daysOffsetRef"
  />

  <!-- Dropdown menus for CONT_DRUG inputs -->
  <DropdownMenu
    v-if="gapDaysRef && showContDrugInputs"
    :options="gapDaysOptions"
    @select="updateGapDays"
    :target="gapDaysRef"
  />
  <DropdownMenu
    v-if="offsetRef && showContDrugInputs"
    :options="offsetOptions"
    @select="updateOffset"
    :target="offsetRef"
  />
  <DropdownMenu
    v-if="daysSupplyOverrideRef && showContDrugInputs"
    :options="daysSupplyOverrideOptions"
    @select="updateDaysSupplyOverride"
    :target="daysSupplyOverrideRef"
  />
</template>

<style lang="scss" scoped>
.query-filter-entry-exit {
  .criteria-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e0e0e0;
    position: relative;
    padding: 16px;

    .criteria-title-container,
    .shadow-container {
      flex: 1;
    }
    .qualifying-events-controls {
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }
  }

  .criteria-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #fe5e59;
  }

  .obs-period {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--d2e-color-primary, #000080);
  }

  .events-container {
    display: flex;
    .sidebar {
      width: 30px;
      display: flex;
      align-items: center;
      border-radius: 0 0 0 8px;
      border: 1px solid var(--d2e-color-primary, #000080);

      .sidebar-top {
        background-color: var(--d2e-color-primary, #000080);
        width: 30%;
        height: 100%;
        border-radius: 0 0 0 6px;
      }
      .sidebar-label {
        writing-mode: sideways-lr;
        text-orientation: sideways;
        font-size: 13px;
        font-weight: 700;
        color: var(--d2e-color-primary, #000080);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        user-select: none;
      }
    }
    .query-filter-event-container {
      flex: 1;
      padding: 8px 16px;

      // Hide event sidebar in this component. Affects nested components..
      ::v-deep(.event-sidebar) {
        display: none;
      }
    }
  }

  .qualifying-events-btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    &:not(:first-child) {
      border-left: var(--d2e-color-primary, #000080) 2px solid;
    }
    font-size: 14px;
    font-weight: 600;
    color: var(--d2e-color-primary, #000080);
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    z-index: 2;
    text-align: center;
    white-space: nowrap;

    &:hover:not(:disabled):not(.qualifying-events-btn--active) {
      background: rgba(30, 58, 138, 0.05);
    }

    &--active {
      background: var(--d2e-color-primary, #000080);
      color: white;
      box-shadow: 0 2px 4px rgba(30, 58, 138, 0.2);
    }

    &--readonly {
      cursor: not-allowed;
      opacity: 0.6;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    // Remove border radius for middle button
    &:not(:first-child):not(:last-child) {
      border-radius: 0;
    }

    // First button - rounded left only
    &:first-child {
      border-radius: 6px 0 0 6px;
    }

    // Last button - rounded right only
    &:last-child {
      border-radius: 0 6px 6px 0;
    }

    // If only one button (shouldn't happen but just in case)
    &:only-child {
      border-radius: 6px;
    }
  }

  .criteria-groups-layout {
    display: flex;
  }

  .criteria-groups-sidebar {
    width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 6px;
    background: var(--d2e-color-primary, #000080); // Blue to match other sidebars
    position: relative;
    border-radius: 8px 0 0 8px; // Round left corners

    // Add subtle border to indicate different states
    &::after {
      content: '';
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 2px;
      background: rgba(255, 255, 255, 0.3);
    }
  }

  .criteria-sidebar-label {
    writing-mode: sideways-lr;
    text-orientation: sideways;
    font-size: 13px;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    user-select: none;
  }

  .criteria-groups-content {
    flex: 1;
    padding: 0 0 0 4px; // Add left padding for spacing from sidebar
  }

  .criteria-groups-layout {
    margin-bottom: 8px;
  }

  .add-group-container {
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }

  .fixed-duration-container {
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .fixed-duration-inputs {
    display: flex;
    justify-content: center;
    gap: 24px;

    label {
      margin-bottom: 0;
    }

    .fixed-input-group {
      display: flex;
      align-items: center;
      gap: 8px;

      .fixed-input-label {
        font-size: 13px;
        color: #666;
        font-weight: 500;
        white-space: nowrap;
      }

      .fixed-dropdown {
        min-width: 100px;
        padding: 6px 12px;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        background: white;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          border-color: var(--d2e-color-primary, #000080);
          background: white;
        }
      }

      .fixed-dropdown-with-suffix {
        display: flex;
        align-items: center;
        gap: 6px;

        .fixed-suffix {
          font-size: 13px;
          color: #666;
          font-weight: 500;
        }
      }
    }
  }

  .cont-drug-container {
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .cont-drug-inputs {
    display: flex;
    flex-direction: column;
    gap: 16px;

    label {
      margin-bottom: 0;
    }

    .cont-drug-input-group {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .cont-drug-input-label {
        font-size: 13px;
        color: #666;
        font-weight: 500;
      }

      .cont-drug-dropdown {
        min-width: 200px;
        max-width: 400px;
        padding: 8px 12px;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        background: white;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          border-color: var(--d2e-color-primary, #000080);
          background: white;
        }
      }

      .cont-drug-concept-set-readonly {
        padding: 8px 12px;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        font-size: 13px;
        color: #666;
        min-width: 200px;
        max-width: 400px;
      }

      .cont-drug-dropdown-with-suffix {
        display: flex;
        align-items: flex-start;
        gap: 8px;

        .cont-drug-dropdown {
          flex-shrink: 0;
          min-width: 80px;
          max-width: 120px;
        }

        .cont-drug-suffix {
          font-size: 13px;
          color: #666;
          font-weight: 400;
          line-height: 1.4;
          margin-top: 2px;
        }
      }
    }
  }

  .btn-add-group {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border: 2px dashed #d0d0d0;
    background: transparent;
    border-radius: 8px;
    color: #666;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      border-color: #1976d2;
      color: #1976d2;
      background: rgba(25, 118, 210, 0.04);
    }

    &__icon {
      font-size: 18px;
      font-weight: 600;
    }

    &__text {
      font-weight: 500;
    }
  }

  .exit-tooltip {
    z-index: 50;
  }
}
</style>

