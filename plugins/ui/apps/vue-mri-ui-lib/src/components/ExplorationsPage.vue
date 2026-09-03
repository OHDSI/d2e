<template>
  <div class="explorations-page" data-testid="explorations-page">
    <header class="explorations-page__header">
      <div class="explorations-page__heading">
        <p class="explorations-page__breadcrumb">D2E · {{ getText('MRI_PA_EXPLORATIONS_TITLE') }}</p>
        <h1 class="explorations-page__title">{{ getText('MRI_PA_EXPLORATIONS_TITLE') }}</h1>
        <p class="explorations-page__description">{{ getText('MRI_PA_EXPLORATIONS_DESCRIPTION') }}</p>
      </div>
      <D2eSelect
        class="explorations-page__dataset"
        size="sm"
        disabled
        :label="getText('MRI_PA_EXPLORATIONS_DATASOURCE')"
        :items="datasetItems"
        :model-value="datasetName"
        prepend-icon="mdi-database-outline"
        data-testid="explorations-datasource"
      />
    </header>

    <div class="explorations-page__toolbar">
      <div class="explorations-page__toolbar-left">
        <D2eTextField
          v-model="searchQuery"
          class="explorations-page__search"
          :placeholder="getText('MRI_PA_EXPLORATIONS_SEARCH')"
          prepend-inner-icon="mdi-magnify"
          hide-details
          data-testid="explorations-search"
        />
      </div>
      <div class="explorations-page__toolbar-right">
        <D2eMenu :width="220" location="bottom end" :items="sortItems" @select="onSortSelect">
          <template #activator="activatorProps">
            <button
              v-bind="activatorProps"
              type="button"
              class="explorations-page__sort"
              data-testid="explorations-sort-btn"
            >
              <v-icon icon="mdi-swap-vertical" size="20" />
              <span>{{ getText('MRI_PA_EXPLORATIONS_SORT_BY') }}: {{ activeSortLabel }}</span>
            </button>
          </template>
        </D2eMenu>

        <D2eButton prepend-icon="mdi-plus" data-testid="explorations-new-btn" @click="$emit('start-new-exploration')">
          {{ getText('MRI_PA_BUTTON_NEW_EXPLORATION') }}
        </D2eButton>
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
        width="100%"
        clickable
        :name="card.name"
        :selected="explorations.isSelected(card.id)"
        :status="card.status"
        :person-count="card.personCount"
        :metadata="card.metadata"
        :bookmark="card.bookmarkRows"
        :bookmark-title="getText('MRI_PA_EXPLORATIONS_BOOKMARK_PANEL')"
        :checkbox-label="`${getText('MRI_PA_EXPLORATIONS_SELECT')} ${card.name}`"
        @update:selected="explorations.toggle(card.id, $event)"
        @click="onCardClick(card, $event)"
      >
        <!-- A never-materialised card has no count, so the lead slot carries the
             Materialize action in its place (Figma 1810:239211). -->
        <template v-if="!card.isMaterialised" #lead>
          <D2eButton
            variant="secondary"
            prepend-icon="mdi-account-multiple-plus-outline"
            :disabled="!canMaterialize"
            :data-testid="`explorations-materialize-lead-${card.id}`"
            @click="openMaterialize(card.source)"
          >
            {{ getText('MRI_PA_BUTTON_MATERIALIZE') }}
          </D2eButton>
        </template>

        <template #toolbar>
          <v-tooltip location="top" :text="getText('MRI_PA_BUTTON_ADD_TO_COLLECTION')">
            <template #activator="{ props: tooltipProps }">
              <span v-bind="tooltipProps">
                <D2eIconButton
                  category="no-stroke"
                  icon="mdi-account-multiple-plus-outline"
                  :disabled="!canMaterialize"
                  :aria-label="getText('MRI_PA_BUTTON_ADD_TO_COLLECTION')"
                  :data-testid="`explorations-materialize-btn-${card.id}`"
                  @click="openMaterialize(card.source)"
                />
              </span>
            </template>
          </v-tooltip>

          <!-- Placeholders, on purpose: data quality is #3119 (not ours), filter
               summary is #3120 and analyze is #3121. They render so the bar
               matches the frame, and do nothing yet. -->
          <v-tooltip
            v-for="placeholder in ACTION_PLACEHOLDERS"
            :key="placeholder.testid"
            location="top"
            :text="getText(placeholder.labelKey)"
          >
            <template #activator="{ props: tooltipProps }">
              <span v-bind="tooltipProps">
                <D2eIconButton
                  category="no-stroke"
                  :icon="placeholder.icon"
                  :aria-label="getText(placeholder.labelKey)"
                  :data-testid="`${placeholder.testid}-${card.id}`"
                />
              </span>
            </template>
          </v-tooltip>

          <D2eMenu
            :width="220"
            location="bottom end"
            :items="moreItems(card)"
            @select="onMoreSelect(card, $event)"
          >
            <template #activator="activatorProps">
              <D2eIconButton
                v-bind="activatorProps"
                category="no-stroke"
                icon="mdi-dots-vertical"
                :aria-label="getText('MRI_PA_EXPLORATIONS_MORE_ACTIONS')"
                :data-testid="`explorations-more-btn-${card.id}`"
              />
            </template>
          </D2eMenu>
        </template>
      </D2eExplorationCard>
    </div>

    <AddCohort
      v-if="materializeTarget"
      v-model="materializeOpen"
      :bookmark-id="materializeProps.bookmarkId"
      :bookmark-name="materializeProps.bookmarkName"
      :cohort-definition-type="materializeProps.cohortDefinitionType"
      :atlas-cohort-definition-id="materializeProps.atlasCohortDefinitionId"
      @update:model-value="onMaterializeClose"
    />

    <RenameExplorationDialog v-model="renameOpen" :bookmark-display="actionTarget" @saved="load" />
    <DeleteExplorationDialog v-model="deleteOpen" :bookmark-display="actionTarget" @deleted="load" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { D2eButton, D2eExplorationCard, D2eIconButton, D2eMenu, D2eSelect, D2eTextField } from '@d2e/ui'
import { useExplorationsStore } from '../stores/explorations'
import { usePortalContext } from '../composables/usePortalContext'
import { filterAndSort, type ExplorationSortKey } from './helpers/explorationList'
import { canModifyBookmark, getBookmarkType } from '../utils/BookmarkUtils'
import AddCohort from './AddCohort.vue'
import RenameExplorationDialog from './RenameExplorationDialog.vue'
import DeleteExplorationDialog from './DeleteExplorationDialog.vue'

const emit = defineEmits<{
  (e: 'open-exploration', bmkId: string, chartType: string | null): void
  (e: 'start-new-exploration'): void
}>()

const store = useStore()
const portalContext = usePortalContext()
const explorations = useExplorationsStore()

// The card's own checkbox and quick-action buttons sit inside the card root, so
// their clicks bubble up to it. Opening the exploration from those would fight
// the control the user actually pressed.
const IGNORED_CLICK_TARGETS = [
  '.d2e-exploration-card__checkbox',
  '.d2e-exploration-card__actions',
  // The lead row carries the Materialize button on a not-run card. Without it
  // here, that click bubbles up and opens the exploration instead.
  '.d2e-exploration-card__lead-row',
].join(', ')

// #3119 data quality, #3120 filter summary and #3121 analyze are not wired yet.
// They render so the action bar matches the frame.
const ACTION_PLACEHOLDERS = [
  { icon: 'mdi-medal-outline', labelKey: 'MRI_PA_EXPLORATIONS_DATA_QUALITY', testid: 'explorations-dq-btn' },
  {
    icon: 'mdi-file-document-outline',
    labelKey: 'MRI_PA_EXPLORATIONS_FILTER_SUMMARY',
    testid: 'explorations-filter-summary-btn',
  },
  { icon: 'mdi-chart-line', labelKey: 'MRI_PA_EXPLORATIONS_ANALYZE', testid: 'explorations-analyze-btn' },
] as const
const EMPTY_VALUE = '-'

const searchQuery = ref('')
const sortKey = ref<ExplorationSortKey>('lastUpdated')

const loading = computed(() => store.getters.getBookmarksLoading)
const loadError = computed(() => store.getters.getBookmarksLoadError)
const datasetName = computed(() => store.getters.getSelectedDataset?.id || portalContext.datasetId)
const datasetItems = computed(() => [{ label: datasetName.value, value: datasetName.value }])
const canMaterialize = computed<boolean>(() => Boolean(store.getters.getCanDatasetMaterializeCohorts))

const getText = (key: string): string => {
  const resolver = store.getters.getText
  return typeof resolver === 'function' ? resolver(key) : key
}

const load = (): void => {
  // Failures land in the store as loadError and render as the error state, so
  // swallow the rejection here rather than leaving it unhandled.
  store.dispatch('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } }).catch(() => {})
}

const sortItems = computed(() =>
  [
    { label: getText('MRI_PA_EXPLORATIONS_SORT_LAST_UPDATED'), value: 'lastUpdated' },
    { label: getText('MRI_PA_EXPLORATIONS_SORT_NAME_ASC'), value: 'nameAsc' },
    { label: getText('MRI_PA_EXPLORATIONS_SORT_NAME_DESC'), value: 'nameDesc' },
  ].map(item => ({ ...item, selected: item.value === sortKey.value })),
)
const activeSortLabel = computed(() => sortItems.value.find(i => i.selected)?.label ?? '')
const onSortSelect = (value: string): void => {
  sortKey.value = value as ExplorationSortKey
}

const cards = computed(() => {
  const all = store.getters.getDisplayBookmarks(false, portalContext.username) || []
  return filterAndSort(all, searchQuery.value, sortKey.value).map((card: Record<string, never>) => {
    const bookmark = card.bookmark
    const cohortDefinition = card.cohortDefinition
    const atlas = card.atlasCohortDefinition
    const id = bookmark?.id ?? cohortDefinition?.id ?? atlas?.id ?? card.displayName
    // An Atlas record is a cohort; a D2E bookmark is an exploration.
    const idLabel = ['A', 'A+M'].includes(getBookmarkType(card))
      ? getText('MRI_PA_EXPLORATIONS_COHORT_ID_LABEL')
      : getText('MRI_PA_EXPLORATIONS_ID_LABEL')

    return {
      id,
      source: card,
      name: card.displayName,
      bmkId: bookmark?.id ?? null,
      chartType: bookmark?.chartType ?? null,
      isMaterialised: Boolean(cohortDefinition),
      status: cohortDefinition ? 'ready' : 'not-run',
      // The card prop is documented as pre-formatted, so localise here.
      personCount:
        typeof cohortDefinition?.patientCount === 'number'
          ? cohortDefinition.patientCount.toLocaleString()
          : undefined,
      // A never-materialised exploration keeps its rows and shows a dash, rather
      // than dropping them and changing the card's height (Figma 1810:241322).
      metadata: [
        {
          label: getText('MRI_PA_EXPLORATIONS_LAST_MATERIALISED'),
          value: cohortDefinition?.createdOnFormatted || EMPTY_VALUE,
        },
        { label: idLabel, value: id || EMPTY_VALUE },
        {
          label: getText('MRI_PA_EXPLORATIONS_DESCRIPTION_LABEL'),
          value: cohortDefinition?.description || atlas?.description || EMPTY_VALUE,
        },
      ],
      bookmarkRows: [
        {
          label: getText('MRI_PA_EXPLORATIONS_CREATED_BY'),
          value: bookmark?.username || atlas?.username || EMPTY_VALUE,
        },
        {
          label: getText('MRI_PA_EXPLORATIONS_LAST_UPDATED'),
          value: bookmark?.dateModifiedFormatted || atlas?.updatedOnFormatted || EMPTY_VALUE,
        },
        { label: getText('MRI_PA_EXPLORATIONS_VERSION'), value: bookmark?.version ?? EMPTY_VALUE },
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

/* ---- card actions ---------------------------------------------------- */

const actionTarget = ref<Record<string, never> | null>(null)
const renameOpen = ref(false)
const deleteOpen = ref(false)
const materializeTarget = ref<Record<string, never> | null>(null)
const materializeOpen = ref(false)

const openMaterialize = (source: Record<string, never>): void => {
  materializeTarget.value = source
  materializeOpen.value = true
}

// Mirrors Bookmarks.addCohort: a D2E record materialises its bookmark, an Atlas
// record materialises its cohort definition.
const materializeProps = computed(() => {
  const target = materializeTarget.value
  if (target?.bookmark) {
    return {
      bookmarkId: target.bookmark.id,
      bookmarkName: target.bookmark.bookmarkname ?? target.displayName,
      cohortDefinitionType: 'D2E',
      atlasCohortDefinitionId: null,
    }
  }
  return {
    bookmarkId: target?.atlasCohortDefinition?.id ?? null,
    bookmarkName: target?.displayName ?? '',
    cohortDefinitionType: 'Atlas',
    atlasCohortDefinitionId: target?.atlasCohortDefinition?.id ?? null,
  }
})

const onMaterializeClose = (open: boolean): void => {
  materializeOpen.value = open
  if (!open) {
    materializeTarget.value = null
  }
}

const moreItems = (card: { source: Record<string, never> }) => {
  // Do not offer an action the user cannot perform: the same ownership guard
  // BookmarkItems applies to rename and delete.
  const owner = card.source.bookmark ?? card.source.atlasCohortDefinition ?? null
  const disabled = !canModifyBookmark(owner, portalContext.username)
  return [
    { label: getText('MRI_PA_TOOLTIP_RENAME_BOOKMARK'), value: 'rename', disabled },
    { label: getText('MRI_PA_TOOLTIP_DELETE_BOOKMARK'), value: 'delete', disabled },
  ]
}

const onMoreSelect = (card: { source: Record<string, never> }, value: string): void => {
  actionTarget.value = card.source
  if (value === 'rename') renameOpen.value = true
  if (value === 'delete') deleteOpen.value = true
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

  /* 208px in the frame. Read-only until #2956 settles the nav contract: the
     dataset arrives through customProps and nothing flows back. */
  &__dataset {
    flex: 0 0 208px;
    min-width: 208px;
    // The floating label sits above the border; without this it clips against
    // the top of the header row.
    margin-top: var(--d2e-spacing-xs);
  }

  /* Sort by is icon-plus-text with no box (Figma 1762:475284). */
  &__sort {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
    color: var(--d2e-color-neutral-black);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  &__toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__toolbar-right {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  /* Search is 466x44 with a 1px #ACABA8 border and a 4px radius
     (Figma 1762:475284). Vuetify's own outlined field is 56px tall. */
  &__search {
    flex: 0 0 466px;
    max-width: 466px;

    :deep(.v-field) {
      border-radius: 4px;
    }

    :deep(.v-field__outline) {
      --v-field-border-width: 1px;
      color: var(--d2e-color-neutral-light);
      opacity: 1;
    }

    :deep(.v-field__input) {
      min-height: 44px;
      padding: 0 16px;
      font-size: 16px;
    }

    :deep(.v-field__prepend-inner) {
      padding-inline-start: 16px;

      .v-icon {
        font-size: 24px;
        opacity: 1;
        color: var(--d2e-color-neutral-light);
      }
    }
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
