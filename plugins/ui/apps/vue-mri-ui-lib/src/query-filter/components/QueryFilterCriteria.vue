<script lang="ts">
export default {
  name: 'QueryFilterCriteria',
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import QueryFilterCriteriaGroup from './QueryFilterCriteriaGroup.vue'
import { QueryFilterCriteriaManager } from '../models/QueryFilterModel'
import type { ConceptSetItemDisplay, ConceptSetDomainValues } from '../types/ConceptSetTypes'
import ButtonMaterial from './ButtonMaterial.vue'
import AddIcon from './icons/AddIcon.vue'
import GroupButtons from './GroupButtons.vue'

interface Props {
  criteriaData?: any
  conceptSets?: ConceptSetItemDisplay[]
  conceptSetDomainValues?: ConceptSetDomainValues
  conceptSetTexts?: Record<string, string>
  datasetId?: string | null
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  criteriaData: () => ({ qualifyingEventsLimit: 'ALL', criteria: [] }),
  conceptSets: () => [],
  readonly: false,
})

const emit = defineEmits<{
  'update:criteria': [criteria: any]
  'criteria-updated': [criteriaManager: QueryFilterCriteriaManager]
  'update-qualifying-limit': [limit: 'ALL' | 'EARLIEST' | 'LATEST']
  'add-criteria-group': [groupData: any]
  'update-criteria-group': [index: number, groupData: any]
  'remove-criteria-group': [index: number]
  'concept-set-action': [action: any]
  'search-change': [searchQuery: string]
}>()

const currentCriteriaData = computed(() => props.criteriaData)

const updateQualifyingLimit = (value: string) => {
  if (value === 'ALL' || value === 'EARLIEST' || value === 'LATEST') {
    emit('update-qualifying-limit', value)
  }
}

const qualifyingEventsOptions = [
  { value: 'EARLIEST', label: 'Earliest' },
  { value: 'ALL', label: 'All' },
  { value: 'LATEST', label: 'Latest' },
]

const currentQualifyingLimit = computed(() => {
  return currentCriteriaData.value.qualifyingEventsLimit || 'ALL'
})

const addNewGroup = () => {
  const staticCount = currentCriteriaData.value.criteria.length + 1
  const newGroup = {
    id: `criteria_${Date.now()}`,
    title: `Criteria ${staticCount}`,
    description: `Description for Criteria ${staticCount}`,
    criteriaType: 'ALL' as 'ALL',
    events: [],
  }

  emit('add-criteria-group', newGroup)
}

const handleGroupUpdate = (groupIndex: number, updatedGroup: any) => {
  emit('update-criteria-group', groupIndex, updatedGroup)
}

const handleGroupRemove = (groupIndex: number) => {
  emit('remove-criteria-group', groupIndex)
}
</script>

<template>
  <div class="query-filter-criteria">
    <!-- Qualifying Events Limit Controls -->
    <div class="criteria-header">
      <div class="criteria-title-container">
        <h3 class="criteria-title">Inclusion Criteria</h3>
      </div>

      <div class="qualifying-events-controls">
        <GroupButtons
          :options="qualifyingEventsOptions"
          :limitValue="currentQualifyingLimit"
          :namePrefix="'criteria'"
          @update-limit-value="updateQualifyingLimit"
        />
      </div>

      <div class="shadow-container"></div>
    </div>

    <!-- Criteria Groups with Sidebar -->
    <div class="criteria-groups-layout">
      <!-- Criteria Groups Sidebar -->
      <div class="criteria-groups-sidebar">
        <div class="criteria-sidebar-top"></div>
        <div><span class="criteria-sidebar-label">ALL</span></div>
      </div>

      <!-- Criteria Groups Only -->
      <div class="criteria-groups-content">
        <!-- Add Group Button (Outside the sidebar layout) -->
        <div v-if="!readonly" class="add-group-container">
          <ButtonMaterial variant="text" color="primary" @button-click="addNewGroup">
            <template #startIcon>
              <AddIcon />
            </template>
            New inclusion criteria
          </ButtonMaterial>
        </div>
        <QueryFilterCriteriaGroup
          v-for="(group, index) in currentCriteriaData.criteria"
          :key="group.id"
          :group="group"
          :group-index="index"
          :concept-sets="conceptSets"
          :concept-set-domain-values="
            conceptSetDomainValues || { values: [], isLoading: false, loadedStatus: 'NO_RESULTS' }
          "
          :concept-set-texts="conceptSetTexts || {}"
          :dataset-id="datasetId || null"
          :readonly="readonly"
          @update-group="handleGroupUpdate(index, $event)"
          @remove-group="handleGroupRemove(index)"
          @search-change="(searchQuery: string) => $emit('search-change', searchQuery)"
          @concept-set-action="action => $emit('concept-set-action', action)"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.query-filter-criteria {
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
    }
  }

  .criteria-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #fe5e59;
  }

  .criteria-groups-layout {
    display: flex;
  }

  .criteria-groups-sidebar {
    width: 30px;
    display: flex;
    align-items: center;
    border-radius: 0 0 0 8px;
    border: 1px solid var(--d2e-color-primary, #000080);
    .criteria-sidebar-top {
      background-color: var(--d2e-color-primary, #000080);
      width: 30%;
      height: 100%;
      border-radius: 0 0 0 6px;
    }
  }

  .criteria-sidebar-label {
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

  .criteria-groups-content {
    flex: 1;
    padding: 16px;
  }

  .add-group-container {
    display: flex;
    justify-content: center;
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
}
</style>
