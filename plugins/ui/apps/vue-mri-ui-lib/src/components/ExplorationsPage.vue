<template>
  <div class="explorations-page" data-testid="explorations-page">
    <div class="explorations-page__card">
      <header class="explorations-page__header">
      <div class="explorations-page__heading">
        <p class="explorations-page__breadcrumb">
          <span>D2E</span>
          <span class="explorations-page__breadcrumb-dot">·</span>
          <span>{{ getText('MRI_PA_EXPLORATIONS_TITLE') }}</span>
          <span class="explorations-page__breadcrumb-rule" />
        </p>
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
        hide-details
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
          :hide-details="true"
          data-testid="explorations-search"
        />
      </div>
      <div class="explorations-page__toolbar-right">
        <D2eMenu :width="220" location="bottom end" :items="sortItems" @select="onSortSelect">
          <template #activator="activatorProps">
            <D2eButton
              v-bind="activatorProps"
              variant="ghost"
              class="explorations-page__sort"
              data-testid="explorations-sort-btn"
            >
              <template #prepend>
                <ExplorationSortIcon :size="22" />
              </template>
              {{ getText('MRI_PA_EXPLORATIONS_SORT_BY') }}: {{ activeSortLabel }}
            </D2eButton>
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
        :clickable="Boolean(card.bmkId)"
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
            :disabled="!canMaterialize || !card.canBeMaterialised"
            :data-testid="`explorations-materialize-lead-${card.id}`"
            @click="openMaterialize(card.source)"
          >
            <template #prepend>
              <ExplorationMaterializeIcon :size="22" />
            </template>
            {{ getText('MRI_PA_BUTTON_MATERIALIZE') }}
          </D2eButton>
        </template>

        <template #toolbar>
          <v-tooltip
            location="top"
            content-class="explorations-tooltip"
            :text="getText('MRI_PA_BUTTON_ADD_TO_COLLECTION')"
          >
            <template #activator="{ props: tooltipProps }">
              <span v-bind="tooltipProps">
                <D2eIconButton
                  category="no-stroke"
                  :disabled="!canMaterialize || !card.canBeMaterialised"
                  :aria-label="getText('MRI_PA_BUTTON_ADD_TO_COLLECTION')"
                  :data-testid="`explorations-materialize-btn-${card.id}`"
                  @click="openMaterialize(card.source)"
                >
                  <ExplorationMaterializeIcon />
                </D2eIconButton>
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
            content-class="explorations-tooltip"
            :text="getText(placeholder.labelKey)"
          >
            <template #activator="{ props: tooltipProps }">
              <span v-bind="tooltipProps">
                <D2eIconButton
                  category="no-stroke"
                  :aria-label="getText(placeholder.labelKey)"
                  :data-testid="`${placeholder.testid}-${card.id}`"
                >
                  <component :is="placeholder.icon" />
                </D2eIconButton>
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
              <v-tooltip
                location="top"
                content-class="explorations-tooltip"
                :text="getText('MRI_PA_EXPLORATIONS_MORE_ACTIONS')"
              >
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps">
                    <D2eIconButton
                      v-bind="activatorProps"
                      category="no-stroke"
                      :aria-label="getText('MRI_PA_EXPLORATIONS_MORE_ACTIONS')"
                      :data-testid="`explorations-more-btn-${card.id}`"
                    >
                      <ExplorationMoreIcon />
                    </D2eIconButton>
                  </span>
                </template>
              </v-tooltip>
            </template>
          </D2eMenu>
        </template>
      </D2eExplorationCard>
    </div>

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

    <!-- Both dialogs reload the list before they emit, so no @saved / @deleted
         handler is wired here; adding one doubles the request. -->
    <RenameExplorationDialog v-model="renameOpen" :bookmark-display="actionTarget" />
    <DeleteExplorationDialog v-model="deleteOpen" :bookmark-display="actionTarget" />
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
import ExplorationMaterializeIcon from './icons/ExplorationMaterializeIcon.vue'
import ExplorationDataQualityIcon from './icons/ExplorationDataQualityIcon.vue'
import ExplorationFilterSummaryIcon from './icons/ExplorationFilterSummaryIcon.vue'
import ExplorationAnalyzeIcon from './icons/ExplorationAnalyzeIcon.vue'
import ExplorationSortIcon from './icons/ExplorationSortIcon.vue'
import ExplorationMoreIcon from './icons/ExplorationMoreIcon.vue'
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
  // The lead row carries the Materialize button on a not-run card. Scope this to
  // the button: the row also holds the person count and the status chip, and
  // those must not become dead zones.
  '.d2e-exploration-card__lead-row .v-btn',
].join(', ')

// #3119 data quality, #3120 filter summary and #3121 analyze are not wired yet.
// They render so the action bar matches the frame.
const ACTION_PLACEHOLDERS = [
  {
    icon: ExplorationDataQualityIcon,
    labelKey: 'MRI_PA_EXPLORATIONS_DATA_QUALITY',
    testid: 'explorations-dq-btn',
  },
  {
    icon: ExplorationFilterSummaryIcon,
    labelKey: 'MRI_PA_EXPLORATIONS_FILTER_SUMMARY',
    testid: 'explorations-filter-summary-btn',
  },
  { icon: ExplorationAnalyzeIcon, labelKey: 'MRI_PA_EXPLORATIONS_ANALYZE', testid: 'explorations-analyze-btn' },
]
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
  return filterAndSort(all, searchQuery.value, sortKey.value).map((card: BookmarkDisplay) => {
    const bookmark = card.bookmark
    const cohortDefinition = card.cohortDefinition
    const atlas = card.atlasCohortDefinition
    // Namespaced: a bookmark id and a cohort-definition id come from different
    // tables and can collide, and two never-materialized records can share a
    // displayName. Either collision makes one checkbox select two cards.
    const id = bookmark?.id
      ? `bookmark:${bookmark.id}`
      : cohortDefinition?.id
        ? `cohort:${cohortDefinition.id}`
        : atlas?.id
          ? `atlas:${atlas.id}`
          : `name:${card.displayName}`
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
      // A type 'M' record has neither a bookmark nor an Atlas definition, so
      // there is nothing to materialise; offering it posts a URL with "null".
      canBeMaterialised: Boolean(bookmark || atlas),
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
        // The frame's id row is the materialised cohort's id, so a card that has
        // never been materialised shows a dash (Figma 1798:192928).
        { label: idLabel, value: cohortDefinition?.id ?? EMPTY_VALUE },
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

const actionTarget = ref<BookmarkDisplay | null>(null)
const renameOpen = ref(false)
const deleteOpen = ref(false)
const materializeTarget = ref<BookmarkDisplay | null>(null)
const materializeOpen = ref(false)

const openMaterialize = (source: BookmarkDisplay): void => {
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
      bookmarkName: target.bookmark.name ?? target.displayName,
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

const moreItems = (card: { source: BookmarkDisplay }) => {
  // Do not offer an action the user cannot perform: the same ownership guard
  // BookmarkItems applies to rename and delete.
  const owner = card.source.bookmark ?? card.source.atlasCohortDefinition ?? null
  const disabled = !canModifyBookmark(owner, portalContext.username)
  // Rename has no path for an Atlas-backed record: the D2E branch dereferences
  // `bookmark.id` and the materialized branch renames the cohort rather than the
  // definition. Bookmarks.vue gated on the type for exactly this reason.
  const renameDisabled = disabled || !['D', 'M', 'D+M'].includes(getBookmarkType(card.source))
  return [
    {
      label: getText('MRI_PA_BUTTON_RENAME'),
      value: 'rename',
      icon: 'mdi-pencil-outline',
      disabled: renameDisabled,
    },
    // #3123. The backend has no duplicate command yet, so the entry shows but
    // cannot be chosen.
    {
      label: getText('MRI_PA_EXPLORATIONS_DUPLICATE'),
      value: 'duplicate',
      icon: 'mdi-content-copy',
      disabled: true,
    },
    {
      label: getText('MRI_PA_BUTTON_DELETE'),
      value: 'delete',
      icon: 'mdi-trash-can-outline',
      danger: true,
      disabled,
    },
  ]
}

const onMoreSelect = (card: { source: BookmarkDisplay }, value: string): void => {
  actionTarget.value = card.source
  if (value === 'rename') renameOpen.value = true
  if (value === 'delete') deleteOpen.value = true
}
</script>

<style scoped lang="scss">
/* The page is a tinted surface holding one rounded white card inset 24px
   (Figma 1676:221311, a 1392x1011 frame at 24,24). */
.explorations-page {
  height: 100%;
  padding: 24px;
  overflow-y: auto;
  background: var(--d2e-color-neutral-xtra-lightest);
  font-family: var(--d2e-font-family);

  &__card {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    background: var(--d2e-color-white);
    border-radius: var(--d2e-radius-lg);
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 24px;
  }

  /* 10px Medium, 1px tracking, closed by a 24x2 secondary rule
     (Figma 1676:221313). */
  &__breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.5;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--d2e-color-primary);
  }

  &__breadcrumb-dot {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.2px;
    color: var(--d2e-color-neutral-black);
  }

  &__breadcrumb-rule {
    width: 24px;
    height: 2px;
    border-radius: 200px;
    background: var(--d2e-color-secondary);
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

    // Read-only, not broken: keep it at full contrast rather than Vuetify's
    // dimmed disabled treatment, and drop the empty details row whose rule
    // renders as a stray line under the field.
    :deep(.v-input__details) {
      display: none;
    }

    :deep(.v-field--disabled) {
      opacity: 1;
    }

    :deep(.v-field__input),
    :deep(.v-field-label) {
      opacity: 1;
    }
  }



  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 24px;
  }

  &__toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
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

    /* 24px icon, 8px gap, then the placeholder. The field owns the 16px
       inset; the input adds none, or the icon reads as a second slot. */
    :deep(.v-field) {
      padding-inline: 16px;
    }

    :deep(.v-field__input) {
      min-height: 44px;
      padding: 0;
      font-size: 16px;
    }

    :deep(.v-field__prepend-inner) {
      align-items: center;
      padding: 0;
      margin-inline-end: 8px;

      .v-icon {
        font-size: 24px;
        opacity: 1;
        color: var(--d2e-color-neutral-light);
      }
    }
  }

  /* Text button: 22px icon, 8px gap, 16px Medium neutral label, no box
     (Figma 2634:58663). */
  &__sort {
    :deep(.v-btn__content) {
      font-size: 16px;
      font-weight: 500;
      letter-spacing: normal;
      text-transform: none;
      color: var(--d2e-color-neutral);
    }

    :deep(.v-btn__prepend) {
      margin-inline: 0 8px;
      color: var(--d2e-color-neutral);
    }
  }

  &__status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    flex: 1 0 auto;
    justify-content: center;
    color: var(--d2e-color-neutral);
  }

  /* The card's Materialize button outlines in Primary/Lightest. */
  :deep(.d2e-exploration-card__lead-row .d2e-button.v-btn--variant-outlined) {
    border-color: var(--d2e-color-primary-lightest);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 324px);
    justify-content: start;
    column-gap: 16px;
    row-gap: 40px;
    padding: 24px;
  }
}
</style>

<!-- Not scoped: Vuetify teleports tooltip content to <body>, so a scoped rule
     never reaches it. White surface, neutral text (Figma 1798:208323). -->
<style lang="scss">
.explorations-tooltip .v-overlay__content,
.v-overlay__content.explorations-tooltip {
  padding: 8px 12px;
  background: var(--d2e-color-white);
  color: var(--d2e-color-neutral);
  border-radius: 4px;
  box-shadow: 0 0 10px rgb(0 0 0 / 22%);
  font-family: var(--d2e-font-family);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  opacity: 1;
}
</style>
