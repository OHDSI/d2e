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
        :bookmark="card.bookmarkRows"
        :bookmark-title="BOOKMARK_PANEL_TITLE"
        :checkbox-label="`${getText('MRI_PA_EXPLORATIONS_SELECT')} ${card.name}`"
        @update:selected="explorations.toggle(card.id, $event)"
        @click="onCardClick(card, $event)"
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
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { D2eButton, D2eExplorationCard, D2eIconButton, D2eTextField } from '@d2e/ui'
import { useExplorationsStore } from '../stores/explorations'
import { usePortalContext } from '../composables/usePortalContext'

const emit = defineEmits<{ (e: 'open-exploration', bmkId: string, chartType: string | null): void }>()

const store = useStore()
const portalContext = usePortalContext()
const explorations = useExplorationsStore()

// The card's own checkbox and quick-action buttons sit inside the card root, so
// their clicks bubble up to it. Opening the exploration from those would fight
// the control the user actually pressed.
const IGNORED_CLICK_TARGETS = '.d2e-exploration-card__checkbox, .d2e-exploration-card__actions'
const BOOKMARK_PANEL_TITLE = 'Exploration bookmark'
const EMPTY_VALUE = '-'

const searchQuery = ref('')

const loading = computed(() => store.getters.getBookmarksLoading)
const loadError = computed(() => store.getters.getBookmarksLoadError)
const datasetName = computed(() => store.getters.getSelectedDataset?.id || portalContext.datasetId)

const getText = (key: string): string => {
  const resolver = store.getters.getText
  return typeof resolver === 'function' ? resolver(key) : key
}

const load = (): void => {
  // Failures land in the store as loadError and render as the error state, so
  // swallow the rejection here rather than leaving it unhandled.
  store.dispatch('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } }).catch(() => {})
}

const cards = computed(() => {
  const all = store.getters.getDisplayBookmarks(false, portalContext.username) || []
  const query = searchQuery.value.trim().toLowerCase()
  return all
    .filter(card => !query || (card.displayName || '').toLowerCase().includes(query))
    .map(card => {
      const bookmark = card.bookmark
      const cohortDefinition = card.cohortDefinition
      const atlas = card.atlasCohortDefinition
      const id = bookmark?.id ?? cohortDefinition?.id ?? atlas?.id ?? card.displayName
      // A never-materialised exploration keeps its rows and shows a dash, rather
      // than dropping them and changing the card's height (Figma 1810:241322).
      return {
        id,
        name: card.displayName,
        bmkId: bookmark?.id ?? null,
        chartType: bookmark?.chartType ?? null,
        metadata: [
          { label: 'Last Materialised on', value: cohortDefinition?.createdOnFormatted || EMPTY_VALUE },
          { label: 'Exploration ID', value: id || EMPTY_VALUE },
          {
            label: 'Description',
            value: cohortDefinition?.description || atlas?.description || EMPTY_VALUE,
          },
        ],
        bookmarkRows: [
          { label: 'Created by', value: bookmark?.username || atlas?.username || EMPTY_VALUE },
          { label: 'Last updated', value: bookmark?.dateModifiedFormatted || EMPTY_VALUE },
          { label: 'Version', value: bookmark?.version ?? EMPTY_VALUE },
        ],
      }
    })
})

const onCardClick = (card: { bmkId: string | null; chartType: string | null }, event: MouseEvent): void => {
  if (!card.bmkId) return
  const target = event.target as HTMLElement | null
  if (target?.closest(IGNORED_CLICK_TARGETS)) return
  // Allows highlighting text on the card without opening it, as BookmarkItems does.
  if ((window.getSelection()?.toString().length ?? 0) > 0) return
  emit('open-exploration', card.bmkId, card.chartType)
}
</script>

<style scoped lang="scss">
/* The frame draws the page as one rounded card inset 24px from the viewport,
   not as a bare pane (Figma 1676:221307). */
.explorations-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  margin: 24px;
  padding: 24px;
  overflow-y: auto;
  background: var(--d2e-color-white);
  border-radius: 16px;
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
    /* 16px between columns, 40px between rows (Figma 1676:222326). */
    column-gap: 16px;
    row-gap: 40px;
  }
}
</style>
