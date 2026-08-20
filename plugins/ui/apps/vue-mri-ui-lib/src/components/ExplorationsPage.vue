<template>
  <div class="explorations-page" data-testid="explorations-page">
    <header class="explorations-page__header">
      <div class="explorations-page__heading">
        <p class="explorations-page__breadcrumb">D2E · {{ getText('MRI_PA_EXPLORATIONS_TITLE') }}</p>
        <h1 class="explorations-page__title">{{ getText('MRI_PA_EXPLORATIONS_TITLE') }}</h1>
        <p class="explorations-page__description">{{ getText('MRI_PA_EXPLORATIONS_DESCRIPTION') }}</p>
      </div>
      <div class="explorations-page__dataset">
        <span class="explorations-page__dataset-label">{{ getText('MRI_PA_EXPLORATIONS_DATASOURCE') }}</span>
        <span class="explorations-page__dataset-value">{{ datasetName }}</span>
      </div>
    </header>

    <div class="explorations-page__toolbar">
      <div class="explorations-page__toolbar-left">
        <D2eTextField v-model="searchQuery" :label="getText('MRI_PA_EXPLORATIONS_SEARCH')" />
        <D2eButton disabled data-testid="explorations-new-btn">
          {{ getText('MRI_PA_BUTTON_NEW_EXPLORATION') }}
        </D2eButton>
      </div>
      <div class="explorations-page__toolbar-right">
        <D2eIconButton
          category="no-stroke"
          icon="mdi-refresh"
          :aria-label="getText('MRI_PA_BOOKMARKS_REFRESH')"
          data-testid="explorations-refresh-btn"
          @click="load"
        />
      </div>
    </div>

    <div v-if="loading" class="explorations-page__status" data-testid="explorations-loading">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <div v-else-if="loadError" class="explorations-page__status" data-testid="explorations-error">
      <p>{{ getText('MRI_PA_EXPLORATIONS_LOAD_ERROR') }}</p>
      <D2eButton variant="secondary" @click="load">
        {{ getText('MRI_PA_COLL_BUT_RETRY') }}
      </D2eButton>
    </div>

    <div v-else-if="cards.length === 0" class="explorations-page__status" data-testid="explorations-empty">
      {{ getText('MRI_PA_EXPLORATIONS_EMPTY') }}
    </div>

    <div v-else class="explorations-page__grid" data-testid="explorations-grid">
      <D2eExplorationCard
        v-for="card in cards"
        :key="card.id"
        width="324px"
        :name="card.name"
        :selected="explorations.isSelected(card.id)"
        :metadata="card.metadata"
        :checkbox-label="`${getText('MRI_PA_EXPLORATIONS_SELECT')} ${card.name}`"
        @update:selected="explorations.toggle(card.id, $event)"
      >
        <template #toolbar>
          <D2eIconButton
            category="no-stroke"
            icon="mdi-database-arrow-up"
            :aria-label="getText('MRI_PA_BUTTON_ADD_TO_COLLECTION')"
          />
          <D2eIconButton
            category="no-stroke"
            icon="mdi-pencil"
            :aria-label="getText('MRI_PA_TOOLTIP_RENAME_BOOKMARK')"
          />
          <D2eIconButton
            category="no-stroke"
            icon="mdi-delete"
            :aria-label="getText('MRI_PA_TOOLTIP_DELETE_BOOKMARK')"
          />
        </template>
      </D2eExplorationCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { D2eButton, D2eExplorationCard, D2eIconButton, D2eTextField } from '@d2e/ui'
import { useExplorationsStore } from '../stores/explorations'
import { usePortalContextStore } from '../stores/portalContext'

const store = useStore()
const portalContext = usePortalContextStore()
const explorations = useExplorationsStore()

const searchQuery = ref('')

const loading = computed(() => store.getters.getBookmarksLoading)
const loadError = computed(() => store.getters.getBookmarksLoadError)
const datasetName = computed(() => store.getters.getSelectedDataset?.id || portalContext.datasetId)

const getText = (key: string): string => {
  const resolver = store.getters.getText
  return typeof resolver === 'function' ? resolver(key) : key
}

const load = (): void => {
  store.dispatch('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } }).catch(() => {})
}

const cards = computed(() => {
  const all = store.getters.getDisplayBookmarks(false, portalContext.username) || []
  const query = searchQuery.value.trim().toLowerCase()
  return all
    .filter(card => !query || (card.displayName || '').toLowerCase().includes(query))
    .map(card => {
      const id = card.bookmark?.id ?? card.cohortDefinition?.id ?? card.atlasCohortDefinition?.id ?? card.displayName
      const description = card.cohortDefinition?.description || card.atlasCohortDefinition?.description || ''
      const metadata: Array<{ label: string; value: string }> = [{ label: 'Exploration ID', value: id }]
      if (description) {
        metadata.push({ label: 'Description', value: description })
      }
      return {
        id,
        name: card.displayName,
        metadata,
      }
    })
})

onMounted(load)
</script>

<style scoped lang="scss">
.explorations-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  font-family: var(--d2e-font-family);

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }

  &__breadcrumb {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--d2e-color-primary);
  }

  &__title {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -2px;
    color: var(--d2e-color-primary);
  }

  &__description {
    max-width: 760px;
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--d2e-color-neutral);
  }

  &__dataset {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    min-width: 200px;
  }

  &__dataset-label {
    font-size: 12px;
    color: var(--d2e-color-neutral-light);
  }

  &__dataset-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--d2e-color-neutral-black);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  &__toolbar-left,
  &__toolbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    color: var(--d2e-color-neutral);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(324px, 1fr));
    gap: 16px;
  }
}
</style>
