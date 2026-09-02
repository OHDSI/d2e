<script lang="ts">
export default {
  name: 'QueryFilterEventCard',
}
</script>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import QueryFilterNestedCriteria, { type NestedCriteria } from './QueryFilterNestedCriteria.vue'
import AttributesDropdown from './AttributesDropdown.vue'
import QueryFilterTagInputAdapter from '../../lib/ui/QueryFilterTagInputAdapter.vue'
import type { QueryFilterCardinality, QueryFilterEvent, QueryFilterAttribute } from '../types/QueryFilterTypes'
import type {
  ConceptSetItemDisplay,
  ConceptSetDomainValues,
  ConceptSetAction,
  SelectedConceptSet,
} from '../types/ConceptSetTypes'
import type { AttributeOption } from '../utils/ConfigLoader'
import { configLoader } from '../utils/ConfigLoader'
import CardinalitySidebar from './CardinalitySidebar.vue'
import { usePortalContext } from '@/composables/usePortalContext'
import TrashIcon from './icons/TrashIcon.vue'
import { loadSingleConceptSetDetails } from '../services/ConceptSetApiService'
import AttributeContainer from './attributes/AttributeContainer.vue'
import TemporalRelationshipSection from './TemporalRelationshipSection.vue'

// Attribute update payload types
type AttributeUpdatePayload =
  | { operator: string; value: string; extent?: string } // NumericRange, DateRange (internal format)
  | { Op: string; Text: string } // String (Atlas format - not yet normalized)
  | { StartWith: string; StartOffset: number; EndWith: string; EndOffset: number } // DateAdjustment (Atlas format - not yet normalized)

interface Props {
  event: QueryFilterEvent
  eventIndex: number
  conceptSets?: ConceptSetItemDisplay[]
  conceptSetDomainValues?: ConceptSetDomainValues
  conceptSetTexts?: Record<string, string>
  datasetId?: string | null
  nestedLevel?: number
  readonly?: boolean
  sectionType?: 'initialEvents' | 'censoringEvents' | 'criteriaGroup'
}

const props = withDefaults(defineProps<Props>(), {
  conceptSets: () => [],
  nestedLevel: 0,
  readonly: false,
})

const emit = defineEmits<{
  'update:event': [event: QueryFilterEvent]
  'remove-event': []
  'duplicate-event': []
  'concept-set-selected': [conceptSet: ConceptSetItemDisplay | null]
  'attribute-selected': [attribute: AttributeOption]
  'attribute-removed': [attributeId: string]
  'concept-set-action': [action: ConceptSetAction]
  'search-change': [searchQuery: string]
}>()

const store = useStore()
const portalContext = usePortalContext()

// Use the reactive prop directly instead of local copy
const eventData = computed({
  get: () => {
    return props.event
  },
  set: (value: QueryFilterEvent) => {
    emit('update:event', value)
  },
})

// Check if event has nested attributes
const hasNestedAttributes = computed(() => {
  return eventData.value.attributes?.some(attr => attr.attributeType === 'nested')
})

// Check if event type needs concept set selection based on configuration
// Some criteria types (like demographic) don't require a concept set as they only have attributes
const needsConceptSet = computed(() => {
  const eventType = eventData.value.eventType || eventData.value.criteriaType
  if (!eventType) return true // Default to true if no type specified
  return configLoader.requiresConceptSet(eventType)
})

// Check if this event type has temporal relationship in config
const hasTemporalRelationship = computed(() => {
  const eventType = eventData.value.eventType || eventData.value.criteriaType
  if (!eventType) return false

  // Check if temporalRelationship attribute exists in config for this event type
  const temporalConfig = configLoader.getAttributeConfig(eventType, 'temporalRelationship')
  if (!temporalConfig) return false

  // Check if this section is excluded (only for top-level events, nested events always show)
  if (props.nestedLevel === 0 && props.sectionType && temporalConfig.excludeFromSections) {
    return !temporalConfig.excludeFromSections.includes(props.sectionType)
  }

  // For nested events (nestedLevel > 0), always show temporal relationship if config exists
  return true
})

// Handle temporal relationship updates
const handleTemporalRelationshipUpdate = (updatedEvent: QueryFilterEvent) => {
  eventData.value = updatedEvent
}

// Handle cardinality changes
const updateCardinality = (updatedEventCardinality: QueryFilterCardinality) => {
  const updatedEvent: QueryFilterEvent = {
    ...eventData.value,
    cardinality: updatedEventCardinality,
  }
  eventData.value = updatedEvent
}

// Handle concept set changes (add/remove/update)
const handleConceptSetChange = async (values: ConceptSetItemDisplay[]) => {
  if (!values || values.length === 0) {
    // Remove concept set
    const updatedEvent: QueryFilterEvent = {
      ...eventData.value,
      selectedConceptSet: undefined,
      conceptSetId: undefined,
      conceptSet: '',
      conceptSetDetails: [],
      conceptSetLoading: false,
    }
    eventData.value = updatedEvent
    emit('concept-set-selected', null)
    return
  }

  // For events, we typically only support one concept set
  const conceptSet = values[0]
  if (conceptSet) {
    await handleConceptSetSelected(conceptSet)
  }
}

// Handle concept set selection
const handleConceptSetSelected = async (conceptSet: ConceptSetItemDisplay) => {
  const selectedConceptSet: SelectedConceptSet = {
    value: conceptSet.value,
    text: conceptSet.text || '',
    display_value: conceptSet.display_value || '',
    conceptIds: conceptSet.conceptIds || [],
    concepts:
      conceptSet.concepts?.map(c => ({
        id: c.id || c.concept_id || 0,
        useMapped: c.useMapped || false,
        isExcluded: c.isExcluded || false,
        useDescendants: c.useDescendants || false,
      })) || [],
    shared: false,
    userName: '',
    createdDate: '',
    modifiedDate: '',
  }

  // Create the loading event and keep a local reference
  const updatedEvent: QueryFilterEvent = {
    ...eventData.value,
    selectedConceptSet,
    conceptSetId: conceptSet.value,
    conceptSet: conceptSet.text || conceptSet.display_value || conceptSet.value,
    conceptSetLoading: true,
  }
  eventData.value = updatedEvent
  emit('concept-set-selected', conceptSet)

  // Load concept set details for Atlas conversion
  try {
    const conceptSetDetails = await loadSingleConceptSetDetails(conceptSet, getDatasetIdFromProps())

    // Update event with concept set details - use updatedEvent as base, not eventData.value
    // to preserve the loading state we set above
    const eventWithDetails: QueryFilterEvent = {
      ...updatedEvent,
      conceptSetDetails,
      conceptSetLoading: false,
    }
    eventData.value = eventWithDetails
  } catch (error) {
    console.error('Failed to load concept set details:', error)
    // Update loading state even if failed - use updatedEvent as base
    const eventWithError: QueryFilterEvent = {
      ...updatedEvent,
      conceptSetLoading: false,
    }
    eventData.value = eventWithError
  }
}

// Helper to get dataset ID from props or fallback chain
const getDatasetIdFromProps = (): string => {
  // Use dataset ID passed as prop first
  if (props.datasetId) {
    return props.datasetId
  }

  // Fallback to store if prop not provided (legacy support)
  const datasetId = store?.state?.selectedDataset?.id
  if (datasetId) {
    return datasetId
  }

  // Final fallback to portal context datasetId if neither prop nor store available
  if (portalContext.datasetId) {
    return portalContext.datasetId
  }

  // This should not happen in normal operation - indicates configuration issue
  throw new Error('Dataset ID is required but not available from props, store or portal context')
}

// Handle attribute selection
const handleAttributeSelected = (attribute: AttributeOption) => {
  // attribute here is in the shape that the dropdown emits, not to be confused with the criteria json structure
  const currentAttributes = eventData.value.attributes || []
  const currentSelectedAttributes = eventData.value.selectedAttributes || []

  // Check if attribute is already selected to prevent duplicates
  if (currentAttributes.some(attr => attr.id === attribute.id)) {
    console.warn(`Attribute ${attribute.id} is already selected`)
    return
  }

  // Create new attribute based on type
  let newAttribute: QueryFilterAttribute
  if (attribute.type === 'nested') {
    newAttribute = {
      id: attribute.id,
      attributeId: attribute.id, // Add attributeId to make nested consistent with other attributes
      attributeType: 'nested',
      nestedCriteria: {
        id: `nested_${Date.now()}`,
        criteriaType: 'ALL' as const,
        events: [],
      },
    }
  } else {
    newAttribute = {
      id: attribute.id,
      attributeId: attribute.id,
      attributeType: 'standard' as const,
      configType: attribute.type,
      description: attribute.description || attribute.defaultDescription,
      ...(attribute.domainFilter ? { domainFilter: attribute.domainFilter } : {}),
    }
  }

  // Store both the ID (for compatibility) and the full object
  const updatedEvent: QueryFilterEvent = {
    ...eventData.value,
    selectedAttributes: [...currentSelectedAttributes, attribute.id],
    attributes: [...currentAttributes, newAttribute],
  }
  eventData.value = updatedEvent
  emit('attribute-selected', attribute)
}

// Handle attribute removal
const handleAttributeRemoved = (attributeId: string) => {
  const currentSelectedAttributes = eventData.value.selectedAttributes || []
  const currentAttributes = eventData.value.attributes || []

  const updatedEvent: QueryFilterEvent = {
    ...eventData.value,
    selectedAttributes: currentSelectedAttributes.filter(id => id !== attributeId),
    attributes: currentAttributes.filter(obj => {
      const match = obj.id !== attributeId
      return match
    }),
  }

  eventData.value = updatedEvent
  emit('attribute-removed', attributeId)
}

// Update a specific attribute's value by id
const updateAttribute = (attributeId: string, payload: AttributeUpdatePayload) => {
  const currentAttributes = eventData.value.attributes || []
  const updatedAttributes = currentAttributes.map(attr => {
    if (attr.id === attributeId) {
      return { ...attr, ...payload }
    }
    return attr
  })
  const updatedEvent: QueryFilterEvent = {
    ...eventData.value,
    attributes: updatedAttributes,
  }
  eventData.value = updatedEvent
}

// Handle event removal
const removeEvent = () => {
  if (confirm('Are you sure you want to remove this event?')) {
    emit('remove-event')
  }
}

// Handle attribute concept set selection
const handleAttributeConceptSetSelected = (attributeId: string, conceptSet: ConceptSetItemDisplay) => {
  const currentAttributes = eventData.value.attributes || []
  const updatedAttributes = currentAttributes.map(attr => {
    if (
      attr.id === attributeId &&
      attr.attributeType === 'standard' &&
      'configType' in attr &&
      attr.configType === 'conceptSet'
    ) {
      return {
        ...attr,
        conceptSet: conceptSet,
        conceptSetId: conceptSet.value,
      }
    }
    return attr
  })

  const updatedEvent: QueryFilterEvent = {
    ...eventData.value,
    attributes: updatedAttributes,
  }
  eventData.value = updatedEvent
}

// Handle attribute nested criteria updates
const handleAttributeNestedCriteriaUpdate = (attributeId: string, nestedCriteria: NestedCriteria) => {
  const currentAttributes = eventData.value.attributes || []
  const updatedAttributes = currentAttributes.map(attr => {
    if (attr.id === attributeId && attr.attributeType === 'nested') {
      return { ...attr, nestedCriteria }
    }
    return attr
  })

  const updatedEvent: QueryFilterEvent = {
    ...eventData.value,
    attributes: updatedAttributes,
  }
  eventData.value = updatedEvent
}

// Create tag input model for concept set selection
const tagInputModel = computed(() => {
  // Get the event type
  const eventType = eventData.value.eventType

  // Get the domain filter from the "default" attribute config for this event type
  const defaultAttributeConfig = configLoader.getAttributeConfig(eventType, 'default')
  const domainFilter = defaultAttributeConfig?.domainFilter

  const model = {
    id: `event-concept-set-${eventData.value.id}`,
    props: {
      type: 'conceptSet',
      value: eventData.value.selectedConceptSet
        ? [
            {
              value: eventData.value.selectedConceptSet.value,
              text: eventData.value.selectedConceptSet.text,
              display_value: eventData.value.selectedConceptSet.display_value,
              conceptIds: eventData.value.selectedConceptSet.conceptIds,
              concepts: eventData.value.selectedConceptSet.concepts,
            },
          ]
        : [],
      attributePath: 'condition_occurrence.concept_id',
      domainFilter: domainFilter,
      standardConceptCodeFilter: 'Standard',
    },
  }
  return model
})

// Get the external value for the tag input (ensuring it's always an array)
const getTagInputValue = () => {
  const result = eventData.value.selectedConceptSet
    ? [
        {
          value: eventData.value.selectedConceptSet.value,
          text: eventData.value.selectedConceptSet.text,
          display_value: eventData.value.selectedConceptSet.display_value,
          conceptIds: eventData.value.selectedConceptSet.conceptIds,
          concepts: eventData.value.selectedConceptSet.concepts,
        },
      ]
    : []
  return result
}

// Get event type display name
const getEventTypeDisplay = (eventType?: string, criteriaType?: string) => {
  // Use criteriaType as fallback if eventType is not available (happens after setData())
  const typeToUse = eventType || criteriaType
  if (!typeToUse) return 'Unknown Event'

  const typeMap: Record<string, string> = {
    conditionEra: 'Condition Era',
    conditionOccurrence: 'Condition Occurrence',
    death: 'Death',
    demographic: 'Demographic',
    deviceExposure: 'Device Exposure',
    doseEra: 'Dose Era',
    drugEra: 'Drug Era',
    drugExposure: 'Drug Exposure',
    locationRegion: 'Location Region',
    measurement: 'Measurement',
    observationPeriod: 'Observation Period',
    payerPlanPeriod: 'Payer Plan Period',
    procedureOccurrence: 'Procedure Occurrence',
    specimen: 'Specimen',
    observation: 'Observation',
    visitDetail: 'Visit Detail',
    visitOccurrence: 'Visit Occurrence',
  }

  return typeMap[typeToUse] || typeToUse
}

// Get concept set display name for readonly mode
const getConceptSetDisplayName = (): string => {
  // Priority: selectedConceptSet.text > selectedConceptSet.display_value > conceptSet property > conceptSetId
  if (eventData.value.selectedConceptSet) {
    return (
      eventData.value.selectedConceptSet.text ||
      eventData.value.selectedConceptSet.display_value ||
      eventData.value.selectedConceptSet.value ||
      'Unknown Concept Set'
    )
  }

  if (eventData.value.conceptSet) {
    return eventData.value.conceptSet
  }

  if (eventData.value.conceptSetId) {
    return `Concept Set ${eventData.value.conceptSetId}`
  }

  return ''
}

// Create attribute model for TagInputAdapter
const createAttributeModel = (attribute: QueryFilterAttribute) => {
  const attrType = 'configType' in attribute && attribute.configType === 'concept' ? 'concept' : 'conceptSet'
  const hasDomainFilter = 'domainFilter' in attribute && attribute.domainFilter
  const domainFilter = hasDomainFilter ? attribute.domainFilter : 'Condition'

  const value =
    'configType' in attribute && attribute.configType === 'concept'
      ? 'conceptItems' in attribute && attribute.conceptItems
        ? attribute.conceptItems
        : []
      : 'conceptSet' in attribute && attribute.conceptSet
        ? [attribute.conceptSet]
        : []
  const model = {
    id: `attribute-${attribute.id}-${eventData.value.id}`,
    props: {
      type: attrType,
      value: value,
      attributePath: 'condition_occurrence.concept_id',
      domainFilter: domainFilter,
      standardConceptCodeFilter: 'Standard',
    },
  }
  return model
}
// Expand/collapse state
const isExpanded = ref(true)
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}

// Check attribute type
const isConceptOrNestedAttribute = (attribute: QueryFilterAttribute) => {
  return isConceptAttribute(attribute) || isNestedAttribute(attribute)
}
const isNestedAttribute = (attribute: QueryFilterAttribute) => {
  return 'isNested' in attribute && attribute.isNested
}
const isConceptAttribute = (attribute: QueryFilterAttribute) => {
  return 'configType' in attribute && (attribute.configType === 'concept' || attribute.configType === 'conceptSet')
}
</script>

<template>
  <div
    class="query-filter-event-card"
    :class="{
      'query-filter-event-card--nested': nestedLevel > 0,
      'query-filter-event-card--readonly': readonly,
      'query-filter-event-card--has-nested': hasNestedAttributes,
    }"
  >
    <div class="card-side">
      <CardinalitySidebar
        :cardinality="eventData.cardinality || { type: 'AT_LEAST', count: 1, using: 'ALL' }"
        :event-id="eventData.id"
        :readonly="readonly"
        @update-cardinality="updateCardinality"
      />
    </div>

    <div class="card-main">
      <div class="event-header">
        <div class="event-header__left">
          <div class="event-type-indicator">
            <span class="event-type-label">
              {{ getEventTypeDisplay(eventData.eventType, eventData.criteriaType) }}
            </span>
            <span v-if="nestedLevel > 0" class="nested-indicator"> (Level {{ nestedLevel }}) </span>
          </div>
        </div>

        <div class="event-header__right">
          <button
            class="btn-toggle-expand"
            @click="toggleExpanded"
            :title="isExpanded ? 'Collapse event details' : 'Expand event details'"
          >
            <svg :class="['chevron-icon', { expanded: isExpanded }]" width="24" height="24" viewBox="0 0 24 24">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="currentColor" />
            </svg>
          </button>
          <AttributesDropdown
            v-if="!readonly"
            :criteria-type="eventData.eventType || 'conditionOccurrence'"
            :event-id="eventData.id"
            :all-events="[eventData]"
            @attribute-selected="handleAttributeSelected"
            @attribute-removed="handleAttributeRemoved"
          />
          <div class="btn-remove-event-container" v-if="!readonly">
            <button class="btn-remove-event" @click="removeEvent" title="Remove this event">
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
      <transition name="expand">
        <div v-show="isExpanded" class="event-body">
          <!-- Event Content -->
          <div class="event-content">
            <!-- Concept Set Selection (not shown for demographic criteria) -->
            <div v-if="needsConceptSet" class="concept-set-section">
              <label class="concept-set-label">Event Concept Set:</label>
              <QueryFilterTagInputAdapter
                v-if="!readonly"
                :model="tagInputModel"
                :external-value="getTagInputValue()"
                :external-domain-values="
                  conceptSetDomainValues || { values: [], isLoading: false, loadedStatus: 'NO_RESULTS' }
                "
                :external-texts="conceptSetTexts || {}"
                :is-catalog-attribute="false"
                :max-selections="1"
                @update:value="handleConceptSetChange"
                @search-change="(searchQuery: string) => $emit('search-change', searchQuery)"
                @concept-set-action="
                  (action: ConceptSetAction) => $emit('concept-set-action', { ...action, eventId: eventData.id })
                "
              />
              <div v-else class="concept-set-readonly">
                {{ getConceptSetDisplayName() || 'No concept set selected' }}
              </div>
            </div>

            <!-- Temporal Relationship Section (config-driven) -->
            <TemporalRelationshipSection
              v-if="hasTemporalRelationship"
              :event="eventData"
              @update="handleTemporalRelationshipUpdate"
            />

            <!-- Selected Attributes Display -->
            <div v-if="eventData.attributes?.length" class="selected-attributes">
              <div v-for="attribute in eventData.attributes" :key="attribute.id" class="attribute-component">
                <!-- Attribute Header -->
                <div v-if="isConceptOrNestedAttribute(attribute)" class="attribute-header">
                  <span class="attribute-title">{{
                    'title' in attribute
                      ? attribute.title
                      : 'name' in attribute
                        ? attribute.name
                        : attribute.attributeType === 'nested'
                          ? 'Nested Criteria'
                          : attribute.id
                  }}</span>
                  <button v-if="!readonly" class="attribute-remove" @click="handleAttributeRemoved(attribute.id)">
                    ×
                  </button>
                </div>

                <!-- Nested Criteria Attribute -->
                <div v-if="attribute.attributeType === 'nested'" class="attribute-nested">
                  <QueryFilterNestedCriteria
                    :nested-criteria="attribute.nestedCriteria"
                    :concept-sets="conceptSets"
                    :concept-set-domain-values="
                      conceptSetDomainValues || { values: [], isLoading: false, loadedStatus: 'NO_RESULTS' }
                    "
                    :concept-set-texts="conceptSetTexts || {}"
                    :dataset-id="datasetId || null"
                    :readonly="readonly"
                    :hide-header="true"
                    @update:nested-criteria="criteria => handleAttributeNestedCriteriaUpdate(attribute.id, criteria)"
                    @search-change="(searchQuery: string) => $emit('search-change', searchQuery)"
                    @concept-set-action="
                      (action: ConceptSetAction) =>
                        $emit('concept-set-action', { ...action, parentAttributeId: attribute.id })
                    "
                  />
                </div>

                <!-- Regular Attribute with Concept Set -->
                <template v-else>
                  <div v-if="isConceptAttribute(attribute)" class="attribute-concept-set">
                    <label class="attribute-concept-set-label">
                      {{
                        'description' in attribute
                          ? attribute.description
                          : `Select ${'name' in attribute ? attribute.name : attribute.id} concepts:`
                      }}
                    </label>
                    <QueryFilterTagInputAdapter
                      v-if="!readonly"
                      :model="createAttributeModel(attribute)"
                      :external-value="
                        'conceptItems' in attribute && attribute.conceptItems
                          ? attribute.conceptItems
                          : 'conceptSet' in attribute && attribute.conceptSet
                            ? [attribute.conceptSet]
                            : []
                      "
                      :external-domain-values="
                        // Using empty values so dropdown doesn't show for concepts type
                        ('configType' in attribute &&
                          attribute.configType === 'conceptSet' &&
                          conceptSetDomainValues) || {
                          values: [],
                          isLoading: false,
                          loadedStatus: 'NO_RESULTS',
                        }
                      "
                      :external-texts="conceptSetTexts || {}"
                      :is-catalog-attribute="false"
                      @update:value="
                        values => {
                          if ('configType' in attribute && attribute.configType === 'concept') {
                            return
                          } else {
                            // For concept sets, use the existing handler
                            values[0] && handleAttributeConceptSetSelected(attribute.id, values[0])
                          }
                        }
                      "
                      @search-change="(searchQuery: string) => $emit('search-change', searchQuery)"
                      @concept-set-action="
                        (action: ConceptSetAction) => {
                          $emit('concept-set-action', {
                            ...action,
                            attributeId: attribute.attributeId,
                            eventId: eventData.id,
                          })
                        }
                      "
                    />
                    <div v-else class="attribute-concept-set-readonly">
                      {{
                        ('conceptSet' in attribute &&
                        attribute.conceptSet &&
                        typeof attribute.conceptSet === 'object' &&
                        'text' in attribute.conceptSet
                          ? attribute.conceptSet.text
                          : undefined) || 'No concept set selected'
                      }}
                    </div>
                  </div>

                  <div v-else>
                    <AttributeContainer
                      :on-remove-attribute="() => handleAttributeRemoved(attribute.id)"
                      :attribute="attribute"
                      @update-attribute="updateAttribute"
                    />
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Event Body with Sidebar -->
  </div>
</template>

<style lang="scss" scoped>
@use '@/query-filter/styles/ExpandTransition.scss';

.query-filter-event-card {
  display: flex;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  margin-bottom: 8px;
  overflow: visible;
  transition: all 0.2s ease;

  .card-side {
    display: flex;
    min-height: 100px; // For demographics which do not have concept set
  }

  .card-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  &--nested {
    border-left: 3px solid #1976d2;
    margin-left: 16px;
    background: #f8f9fa;
  }

  &--readonly {
    background: #f5f5f5;
    border-color: #ccc;
  }

  &--has-nested {
    border-color: #1976d2;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0px 12px;

    &__left {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    &__right {
      display: flex;
    }
  }

  .event-type-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .event-type-label {
    font-size: 14px;
    color: #595757;
  }

  .nested-indicator {
    font-size: 12px;
    color: #666;
    font-style: italic;
  }

  .event-cardinality {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .cardinality-label {
    color: #666;
    font-weight: 500;
  }

  .cardinality-type-select {
    padding: 2px 6px;
    border: 1px solid #d0d0d0;
    border-radius: 3px;
    font-size: 12px;
    background: #fff;

    &:focus {
      outline: none;
      border-color: #1976d2;
    }
  }

  .cardinality-count-input {
    width: 50px;
    padding: 2px 6px;
    border: 1px solid #d0d0d0;
    border-radius: 3px;
    font-size: 12px;
    text-align: center;

    &:focus {
      outline: none;
      border-color: #1976d2;
    }
  }

  .cardinality-readonly {
    font-weight: 500;
    color: #333;
  }

  .cardinality-suffix {
    color: #666;
  }

  .btn-remove-event-container {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-remove-event {
    border: 1px solid transparent;
    background: #fff;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 6px 8px;

    &:hover {
      color: var(--d2e-color-primary, #000080);
      background: #f2f0f1;
    }
  }

  .event-body {
    display: flex;
  }

  .event-sidebar {
    width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 6px;
    background: #bdd4f0;
    position: relative;
    border-radius: 6px 0 0 6px;
    cursor: pointer;

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

  .sidebar-label {
    writing-mode: sideways-lr;
    text-orientation: sideways;
    color: var(--d2e-color-primary, #000080);
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    user-select: none;
  }

  .event-content {
    flex: 1;
    padding: 0px 12px;
  }

  .concept-set-section {
    margin-bottom: 0px;
  }

  .concept-set-label {
    display: block;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #333;
  }

  .concept-set-readonly {
    padding: 8px 12px;
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    font-size: 14px;
    color: #666;
  }

  .attributes-section {
    margin-bottom: 16px;
  }

  .selected-attributes {
    margin-bottom: 12px;

    &-title {
      margin: 0 0 8px 0;
      font-size: 13px;
      font-weight: 600;
      color: #333;
    }
  }

  .attribute-component {
    margin-bottom: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    background: #fafafa;
    overflow: visible; // Avoid CriteriaSelectorDropdown being clipped in the Nested Criteria

    &:last-child {
      margin-bottom: 0;
    }
  }

  .attribute-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: #f0f0f0;
    border-bottom: 1px solid #e0e0e0;
  }

  .attribute-title {
    font-size: 13px;
    font-weight: 600;
    color: #333;
  }

  .attribute-remove {
    width: 20px;
    height: 20px;
    border: 1px solid #d0d0d0;
    background: #fff;
    border-radius: 3px;
    color: #666;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      border-color: #dc3545;
      color: #dc3545;
      background: #fff5f5;
    }
  }

  .attribute-nested {
    padding: 10px;
  }

  .attribute-concept-set {
    padding: 10px;

    &-label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 500;
      color: #666;
    }

    &-readonly {
      padding: 8px 12px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 13px;
      color: #666;
    }
  }

  .attribute-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .attribute-chip {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    background: #e3f2fd;
    border: 1px solid #bbdefb;
    border-radius: 16px;
    font-size: 12px;

    &-text {
      color: #1565c0;
      font-weight: 500;
    }

    &-remove {
      margin-left: 6px;
      background: none;
      border: none;
      color: #1565c0;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      padding: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;

      &:hover {
        background: rgba(21, 101, 192, 0.1);
      }
    }
  }

  .nested-criteria-section {
    border-top: 1px solid #e0e0e0;
    background: #f9f9f9;
  }
}
</style>
