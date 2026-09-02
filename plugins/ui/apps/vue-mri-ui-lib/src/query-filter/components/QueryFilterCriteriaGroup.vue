<script lang="ts">
export default {
  name: 'QueryFilterCriteriaGroup',
}
</script>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import QueryFilterEventContainer from './QueryFilterEventContainer.vue'
import type { QueryFilterGroup } from '../types/QueryFilterTypes'
import type { ConceptSetItemDisplay, ConceptSetDomainValues } from '../types/ConceptSetTypes'
import EditIcon from './icons/EditIcon.vue'
import CloseIcon from './icons/CloseIcon.vue'
import GroupCriteriaSidebar from './GroupCriteriaSidebar.vue'

interface Props {
  group: QueryFilterGroup
  groupIndex: number
  conceptSets?: ConceptSetItemDisplay[]
  conceptSetDomainValues?: ConceptSetDomainValues
  conceptSetTexts?: Record<string, string>
  datasetId?: string | null
  readonly?: boolean
  hideHeader?: boolean
  readonlyTitle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  conceptSets: () => [],
  readonly: false,
  hideHeader: false,
  readonlyTitle: false,
})

const emit = defineEmits<{
  'update-group': [group: QueryFilterGroup]
  'remove-group': []
  'concept-set-action': [action: any]
  'search-change': [searchQuery: string]
}>()

// Local reactive copy of the group
const localGroup = ref<QueryFilterGroup>({ ...props.group })

// Watch for changes in props.group and update local copy
watch(
  () => props.group,
  newGroup => {
    localGroup.value = { ...newGroup }
  },
  { deep: true }
)

// Update local group when props change
const groupData = computed({
  get: () => localGroup.value,
  set: (value: QueryFilterGroup) => {
    localGroup.value = value
    emit('update-group', value)
  },
})

// Title editing state
const isEditingTitle = ref(false)
const titleInputRef = ref<HTMLInputElement>()

// Handle title changes
const updateTitle = (newTitle: string) => {
  groupData.value = {
    ...groupData.value,
    title: newTitle,
  }
}

// Start editing title
const startEditingTitle = () => {
  if (!props.readonly) {
    isEditingTitle.value = true
    nextTick(() => {
      titleInputRef.value?.focus()
      titleInputRef.value?.select()
    })
  }
}

// Finish editing title
const finishEditingTitle = () => {
  isEditingTitle.value = false
}

// Handle enter key to finish editing
const handleTitleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    finishEditingTitle()
  } else if (event.key === 'Escape') {
    // Restore original title on escape
    localGroup.value.title = props.group.title
    finishEditingTitle()
  }
}

// Handle group criteria changes from sidebar
const updateGroupCriteria = (groupCriteria: { type: 'ALL' | 'ANY' | 'AT_LEAST' | 'AT_MOST'; count?: number }) => {
  groupData.value = {
    ...groupData.value,
    criteriaType: groupCriteria.type,
    criteriaCount: groupCriteria.count,
  }
}

// Handle group type (operator) changes
const updateGroupType = (newType: 'ALL' | 'ANY' | 'AT_LEAST' | 'AT_MOST') => {
  groupData.value = {
    ...groupData.value,
    criteriaType: newType,
  }
}

// Handle events updates from child container
const handleEventsUpdate = (updatedEvents: any[]) => {
  groupData.value = {
    ...groupData.value,
    events: updatedEvents,
  }
  emit('update-group', groupData.value)
}

// Get events from group
const groupEvents = computed(() => {
  return groupData.value.events || []
})

// Handle remove group
const removeGroup = () => {
  if (confirm('Are you sure you want to remove this criteria group?')) {
    emit('remove-group')
  }
}

// Expand/collapse state
const isExpanded = ref(true)
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}

// Removed duplicate criteria selection handler
</script>

<template>
  <div class="query-filter-criteria-group">
    <!-- Group with Full-Height Sidebar -->
    <div class="group-layout">
      <!-- Group Header -->
      <div v-if="!hideHeader" class="group-header">
        <div class="group-header__left">
          <div class="group-title-container">
            <!-- Non-editable Group Label -->
            <div v-if="readonlyTitle" class="title-edit-wrapper">
              <h4 class="group-title-display group-title-readonly">Group</h4>
            </div>
            <!-- Editable Title with Pencil Button -->
            <div v-else class="title-edit-wrapper">
              <input
                v-if="isEditingTitle && !readonly"
                ref="titleInputRef"
                v-model="localGroup.title"
                class="group-title-input"
                placeholder="Group Title"
                @blur="finishEditingTitle"
                @keydown="handleTitleKeydown"
                @input="updateTitle(($event.target as HTMLInputElement).value)"
              />
              <h4 v-else class="group-title-display" @click="readonly ? null : startEditingTitle()">
                {{ localGroup.title || 'Untitled Group' }}
              </h4>
              <button
                v-if="!readonly && !isEditingTitle"
                class="btn-edit-title"
                @click="startEditingTitle"
                title="Edit group title"
              >
                <EditIcon />
              </button>
            </div>
          </div>
        </div>

        <div class="group-header__right">
          <button
            class="btn-toggle-expand"
            @click="toggleExpanded"
            :title="isExpanded ? 'Collapse group details' : 'Expand group details'"
          >
            <svg :class="['chevron-icon', { expanded: isExpanded }]" width="24" height="24" viewBox="0 0 24 24">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="currentColor" />
            </svg>
          </button>
          <button v-if="!readonly" class="btn-remove-group" @click="removeGroup" title="Remove this criteria group">
            <CloseIcon />
          </button>
        </div>
      </div>
      <!-- Group Content Area -->
      <transition name="expand">
        <div v-show="isExpanded" class="group-main">
          <!-- Group Criteria Sidebar -->
          <GroupCriteriaSidebar :group="localGroup" :readonly="readonly" @update-group-criteria="updateGroupCriteria" />
          <!-- Group Content -->
          <div class="group-content">
            <!-- Events Container -->
            <QueryFilterEventContainer
              :events="groupEvents"
              event-type="CRITERIA"
              :parent-group="localGroup"
              :concept-sets="conceptSets"
              :concept-set-domain-values="
                conceptSetDomainValues || { values: [], isLoading: false, loadedStatus: 'NO_RESULTS' }
              "
              :concept-set-texts="conceptSetTexts || {}"
              :dataset-id="datasetId || null"
              :readonly="readonly"
              @update-events="handleEventsUpdate"
              @search-change="(searchQuery: string) => $emit('search-change', searchQuery)"
              @concept-set-action="action => $emit('concept-set-action', action)"
            />
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/query-filter/styles/ExpandTransition.scss';

.query-filter-criteria-group {
  margin-top: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  &:not(:last-child) {
    margin-bottom: 8px;
  }
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  .group-layout {
    display: flex;
    flex-direction: column;
  }

  .group-main {
    flex: 1;
    display: flex;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px 12px;
    border-bottom: 1px solid #f0f0f0;
    background: transparent;
    border-radius: 0 8px 0 0; // Only round top-right corner

    &__left {
      flex: 1;
      margin-right: 16px;
    }

    &__right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
  }

  .group-title-container {
    margin-bottom: 4px;
  }

  .group-title-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 600;
    color: #333;
    background: #fff;

    &:focus {
      outline: none;
      border-color: #1976d2;
      box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
    }

    &::placeholder {
      color: #999;
    }
  }

  .title-edit-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px; // Ensure consistent height
  }

  .group-title-display {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: rgba(0, 0, 0, 0.04);
    }

    &.group-title-readonly {
      cursor: default;
      color: #666;

      &:hover {
        background-color: transparent;
      }
    }
  }

  .btn-edit-title {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: #666;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    opacity: 0.7;

    &:hover {
      background-color: rgba(0, 0, 0, 0.08);
      opacity: 1;
    }

    &:active {
      transform: scale(0.95);
    }
  }

  .group-description-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    font-size: 14px;
    color: #666;
    background: #fff;
    resize: vertical;
    min-height: 40px;

    &:focus {
      outline: none;
      border-color: #1976d2;
      box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
    }

    &::placeholder {
      color: #999;
    }
  }

  .group-description-readonly {
    margin: 0;
    font-size: 14px;
    color: #666;
  }

  .btn-remove-group {
    width: 32px;
    height: 32px;
    border: 1px solid #d0d0d0;
    background: #fff;
    border-radius: 4px;
    color: #666;
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--d2e-color-primary, #000080);
      color: var(--d2e-color-primary, #000080);
      background: #f2f0f1;
    }
  }

  .group-content {
    flex: 1;
    padding: 12px;
    background: #f2f0f1;
  }
}
</style>
