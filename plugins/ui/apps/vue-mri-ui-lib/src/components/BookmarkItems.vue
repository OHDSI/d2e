<script setup lang="ts">
import { formatNumber } from '../utils/NumberUtils'
import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import CohortDefinitionIcon from './icons/CohortDefinitionIcon.vue'
import PatientsActiveIcon from './icons/PatientsActiveIcon.vue'
import EditIcon from './icons/EditIcon.vue'
import GenerateCohortActiveIcon from './icons/GenerateCohortActiveIcon.vue'
import ShareIcon from './icons/ShareIcon.vue'
import PlusInBoxIcon from './icons/PlusInBoxIcon.vue'
import RunAnalyticsActiveIcon from './icons/RunAnalyticsActiveIcon.vue'
import TrashCanIcon from './icons/TrashCanIcon.vue'
import GlobeIcon from './icons/GlobeIcon.vue'
import Constants from '../utils/Constants'
import { getCardsFormatted, getAxisFormatted } from './helpers/bookmarkItems'
import { onErrorCaptured } from 'vue'
import MriFrontendConfig from '../lib/MriFrontEndConfig'
import AxisModel from '../lib/models/AxisModel'
import { getBookmarkType, canModifyBookmark } from '../utils/BookmarkUtils'
import { useAtlasStore } from '../stores/atlas'
import { usePortalContext } from '../composables/usePortalContext'
import { modeOrder } from './StackBarModes/modes'

const store = useStore()
const atlasStore = useAtlasStore()
const portalContext = usePortalContext()
const isAtlasStandalone = import.meta.env.VITE_STANDALONE_ATLAS === 'true'

const {
  getText,
  getMriFrontendConfig: mriFrontEndConfig,
  getAxis,
  getDomainValues,
  getSelectedDataset,
}: {
  getText: (key: string, param?: string | string[]) => string
  getMriFrontendConfig: MriFrontendConfig
  getAxis: (id: number) => AxisModel
  getDomainValues: () => {
    isLoading: false
    isLoaded: false
    values: []
  }
  getSelectedDataset: { id: string }
} = store.getters

const isAtlas = isAtlasStandalone

// Get current username from JWT token for ownership checks
const currentUsername = computed(() => portalContext.username || '')

const props = defineProps<{
  bookmarksDisplay: BookmarkDisplay[]
  compareCohortsSelectionList: Bookmark[]
  useQueryFilterForAtlas: boolean
  canDatasetMaterializeCohorts: boolean
}>()

const bookmarksDisplaySorted = computed(() => {
  let filtered = [...props.bookmarksDisplay]

  // Apply search filter with smart scoring
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()

    // Score each bookmark for relevance (highest priority wins)
    const scoredBookmarks = filtered.map(bookmarkDisplay => {
      let score = 0

      // ID matches (highest priority - score 100)
      const bookmarkId = bookmarkDisplay.bookmark?.id?.toString() || ''
      const cohortId = bookmarkDisplay.cohortDefinition?.id?.toString() || ''
      const atlasId = bookmarkDisplay.atlasCohortDefinition?.id?.toString() || ''

      if (bookmarkId.includes(query) || cohortId.includes(query) || atlasId.includes(query)) {
        score = 100
      } else {
        // Name matches (high priority - score 50)
        const displayName = bookmarkDisplay.displayName?.toLowerCase() || ''
        const cohortName = bookmarkDisplay.cohortDefinition?.cohortDefinitionName?.toLowerCase() || ''
        const atlasName = bookmarkDisplay.atlasCohortDefinition?.name?.toLowerCase() || ''

        if (displayName.includes(query) || cohortName.includes(query) || atlasName.includes(query)) {
          score = 50
        } else {
          // Description matches (medium priority - score 25)
          const description = bookmarkDisplay.cohortDefinition?.description?.toLowerCase() || ''

          if (description.includes(query)) {
            score = 25
          } else {
            // Username matches (lower priority - score 10)
            const username =
              bookmarkDisplay.bookmark?.username?.toLowerCase() ||
              bookmarkDisplay.atlasCohortDefinition?.username?.toLowerCase() ||
              ''

            if (username.includes(query)) {
              score = 10
            }
          }
        }
      }

      return { bookmarkDisplay, score }
    })

    // Filter out items with score 0 and sort by score (descending), then by date
    filtered = scoredBookmarks
      .filter(item => item.score > 0)
      .sort((a, b) => {
        // Primary sort: by score (descending)
        if (a.score !== b.score) {
          return b.score - a.score
        }
        // Secondary sort: by date (most recent first)
        const dateA =
          a.bookmarkDisplay.bookmark?.dateModified ||
          a.bookmarkDisplay.atlasCohortDefinition?.updatedOn ||
          a.bookmarkDisplay.cohortDefinition?.createdOn
        const dateB =
          b.bookmarkDisplay.bookmark?.dateModified ||
          b.bookmarkDisplay.atlasCohortDefinition?.updatedOn ||
          b.bookmarkDisplay.cohortDefinition?.createdOn
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      })
      .map(item => item.bookmarkDisplay)
  }

  // For items with same search score, sort by date
  if (!searchQuery.value.trim()) {
    return filtered.sort((a, b) => {
      const dateToUseA = a.bookmark?.dateModified || a.atlasCohortDefinition?.updatedOn || a.cohortDefinition.createdOn
      const dateToUseB = b.bookmark?.dateModified || b.atlasCohortDefinition?.updatedOn || b.cohortDefinition.createdOn
      return new Date(dateToUseB).getTime() - new Date(dateToUseA).getTime()
    })
  }

  return filtered
})

// Pagination state
const currentPage = ref(1)
const itemsPerPage = ref(10)
const searchQuery = ref('')

// Computed properties for pagination
const totalPages = computed(() => {
  return Math.ceil(bookmarksDisplaySorted.value.length / Number(itemsPerPage.value))
})

const paginatedBookmarks = computed(() => {
  if (!isAtlas) {
    return bookmarksDisplaySorted.value
  }

  const start = (currentPage.value - 1) * Number(itemsPerPage.value)
  const end = start + Number(itemsPerPage.value)
  return bookmarksDisplaySorted.value.slice(start, end)
})

const barChartModeLabels = computed(() => {
  const map = new WeakMap<Bookmark, string>()
  for (const bd of paginatedBookmarks.value) {
    if (bd.bookmark) {
      map.set(bd.bookmark, getBarChartModeLabel(bd.bookmark))
    }
  }
  return map
})

// Watch for changes in bookmarks and reset pagination if needed
watch(
  () => props.bookmarksDisplay.length,
  () => {
    if (currentPage.value > totalPages.value && totalPages.value > 0) {
      currentPage.value = 1
    }
  }
)

// Watch for changes in items per page and reset to page 1
watch(
  () => itemsPerPage.value,
  () => {
    currentPage.value = 1
  }
)

// Watch for changes in search query and reset to page 1
watch(
  () => searchQuery.value,
  () => {
    currentPage.value = 1
  }
)

// Emits - Declare emitted events using defineEmits
const emit = defineEmits([
  'onSelectBookmark',
  'renameBookmark',
  'deleteBookmark',
  'addCohort',
  'openDataQualityDialog',
  'loadBookmarkCheck',
  'loadAtlasBookmark',
])

const onSelectBookmark = bookmarkDisplay => {
  emit('onSelectBookmark', bookmarkDisplay)
}

const renameBookmark = bookmarkDisplay => {
  emit('renameBookmark', bookmarkDisplay)
}

const deleteBookmark = bookmarkDisplay => {
  emit('deleteBookmark', bookmarkDisplay)
}

const addCohort = bookmarkDisplay => {
  emit('addCohort', bookmarkDisplay)
}

const openDataQualityDialog = cohortDefinition => {
  emit('openDataQualityDialog', cohortDefinition)
}

const loadBookmarkCheck = (bookmarkId, chartType) => {
  const selection = window.getSelection()
  // Allows highlighting without clicking
  if (selection.toString().length > 0) {
    return
  }
  emit('loadBookmarkCheck', bookmarkId, chartType)
}

const loadAtlasBookmark = atlasDefinitionId => {
  const selection = window.getSelection()
  // Allows highlighting without clicking
  if (selection.toString().length > 0) {
    return
  }
  emit('loadAtlasBookmark', atlasDefinitionId)
}

const handleBookmarkClick = bookmarkDisplay => {
  if (['D', 'D+M'].includes(getBookmarkType(bookmarkDisplay))) {
    loadBookmarkCheck(bookmarkDisplay.bookmark.id, bookmarkDisplay.bookmark.chartType)
  } else if (props.useQueryFilterForAtlas) {
    loadAtlasBookmark(bookmarkDisplay.atlasCohortDefinition.id)
  } else {
    openAtlasLink(bookmarkDisplay.atlasCohortDefinition.id)
  }
}

const getChartInfo = (chart: string, type: string) => {
  if (Constants.chartInfo[chart]) {
    return Constants.chartInfo[chart][type]
  }
  return ''
}

const getBarChartModeLabel = (bookmark: Bookmark): string => {
  if (!bookmark || bookmark.chartType !== 'stacked' || !bookmark.data) return ''
  try {
    const mode = JSON.parse(bookmark.data)?.barChartType?.mode
    const meta = modeOrder.find(m => m.id === mode)
    return meta?.labelKey ? getText(meta.labelKey) : (meta?.label ?? '')
  } catch {
    return ''
  }
}

const getConstraint = (constraint: any): string => {
  try {
    constraint = typeof JSON.parse(constraint) === 'object' ? JSON.parse(constraint).text : constraint
  } catch (e) {
    // cannot parse the constraint
  }
  return constraint
}

const getConcatenatedConstraints = visibleConstraints => {
  return visibleConstraints.map(constraint => getConstraint(constraint)).join('; ')
}

const openAtlasLink = (id: number) => {
  const selection = window.getSelection()
  // Allows highlighting without clicking
  if (selection.toString().length > 0) {
    return
  }
  atlasStore.openAtlas(`/#/cohortdefinition/${id}`)
}

const getBookmarkCardClass = (bookmarkDisplay: any) => {
  const type = getBookmarkType(bookmarkDisplay)
  return `item-card-body ${type === 'M' ? 'item-card-body-disabled' : ''}`
}

// Check if current user can modify (rename/delete) a bookmark
const canModify = (bookmarkDisplay: BookmarkDisplay): boolean => {
  // For D2E bookmarks, check the bookmark object
  if (bookmarkDisplay.bookmark) {
    return canModifyBookmark(bookmarkDisplay.bookmark, currentUsername.value)
  }
  // For Atlas cohort definitions, check the atlasCohortDefinition object
  if (bookmarkDisplay.atlasCohortDefinition) {
    return canModifyBookmark(bookmarkDisplay.atlasCohortDefinition, currentUsername.value)
  }
  // Materialized cohorts without bookmark/atlas definition cannot be modified
  return false
}

// Pagination navigation methods
const goToPreviousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

const goToNextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

onErrorCaptured((err, instance, info) => {
  console.error('Captured error:', err, instance, info)
  // Stop propagation to prevent the error from reaching parent handlers
  return false // Or true to propagate the error further
})
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%">
    <!-- Bookmarks Grid -->
    <div
      style="
        flex: 1;
        display: grid;
        grid-template-rows: 0fr;
        grid-auto-rows: 0fr;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        overflow-y: auto;
        scrollbar-width: thin;
        gap: 10px;
        padding: 1rem;
      "
    >
      <div
        v-for="bookmarkDisplay in paginatedBookmarks"
        :key="bookmarkDisplay.displayName"
        class="item-card"
        :data-testid="`pa-cohort-card-${bookmarkDisplay.displayName}`"
        style="
          min-width: 300px;
          display: flex;
          flex-direction: column;
          border-radius: 10px;
          background-color: white;
          font-size: 12px;
        "
      >
        <div
          style="flex: 1"
          :class="getBookmarkCardClass(bookmarkDisplay)"
          @click="handleBookmarkClick(bookmarkDisplay)"
        >
          <div style="padding: 24px">
            <div style="display: flex; justify-content: space-between">
              <div style="color: #ff5e59; overflow: hidden; text-overflow: ellipsis">
                {{
                  getBookmarkType(bookmarkDisplay) === 'M'
                    ? bookmarkDisplay.cohortDefinition.cohortDefinitionName
                    : bookmarkDisplay.displayName
                }}
              </div>
              <div v-if="bookmarkDisplay?.bookmark?.shared">
                <ShareIcon />
              </div>
            </div>
            <div style="display: flex; flex-direction: column; padding-top: 10px; max-height: 600px">
              <!-- D2E Cohort Definition -->
              <div
                v-if="bookmarkDisplay.bookmark"
                style="
                  flex: 1;
                  overflow: auto;
                  margin-bottom: 15px;
                  scrollbar-width: thin;
                  scrollbar-color: #ff5e5977 white;
                "
              >
                <div style="display: flex; align-items: center; margin-bottom: 10px">
                  <div style="margin-right: 5px"><CohortDefinitionIcon /></div>
                  <div class="ui-darkest-text" style="font-weight: bold">D2E Cohort Definition</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">ID:</div>
                  <div>{{ bookmarkDisplay.bookmark.id }}</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">By:</div>
                  <div>{{ bookmarkDisplay.bookmark.username }}</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">Version:</div>
                  <div>{{ bookmarkDisplay.bookmark.version }}</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">Updated On:</div>
                  <div>{{ bookmarkDisplay.bookmark.dateModifiedFormatted }}</div>
                </div>
                <div style="display: flex; margin-top: 15px">
                  <div class="bookmark-item-content">
                    <template
                      v-for="(container, containerIndex) in getCardsFormatted({
                        mriFrontEndConfig,
                        boolContainers: bookmarkDisplay.bookmark.filterCardData,
                        getText,
                        getAttributeType: (attributeId: string) =>
                          mriFrontEndConfig.getAttributeByPath(attributeId)?.oInternalConfigAttribute?.type,
                        getDomainValues,
                      })"
                      :key="containerIndex"
                    >
                      <div>
                        <template v-for="filterCard in container.content" :key="filterCard.name">
                          <div class="bookmark-filtercard" style="margin-bottom: 16px">
                            <span class="ui-dark-text" style="font-weight: bold; margin-right: 5px">
                              {{ filterCard.name }}
                            </span>
                            <template v-for="(attribute, index) in filterCard.visibleAttributes" :key="attribute.name">
                              <div class="ui-light-text">{{ attribute.name }}:</div>
                              <div class="ui-light-text">
                                {{ getConcatenatedConstraints(attribute.visibleConstraints)
                                }}{{ index < filterCard.visibleAttributes.length - 1 ? ' | ' : '' }}
                              </div>
                            </template>
                          </div>
                        </template>
                      </div>
                    </template>
                    <div style="display: flex; margin-top: 15px">
                      <span
                        class="icon"
                        :style="'font-family:' + getChartInfo(bookmarkDisplay.bookmark.chartType, 'iconGroup')"
                        >{{ getChartInfo(bookmarkDisplay.bookmark.chartType, 'icon') }}</span
                      >
                      <div>
                        {{ getText(getChartInfo(bookmarkDisplay.bookmark.chartType, 'tooltip')) }}
                        <template v-if="barChartModeLabels.get(bookmarkDisplay.bookmark)">
                          - {{ barChartModeLabels.get(bookmarkDisplay.bookmark) }}
                        </template>
                      </div>
                    </div>
                    <div style="display: flex">
                      <div>
                        <span class="icon" style="font-family: app-icons"></span>
                      </div>
                      <div class="bookmark-item-axes">
                        <template
                          v-for="axis in getAxisFormatted(
                            bookmarkDisplay.bookmark.axisInfo,
                            bookmarkDisplay.bookmark.chartType,
                            mriFrontEndConfig,
                            getAxis
                          )"
                          :key="axis.name"
                        >
                          <div>
                            <label style="display: flex; align-items: top">
                              <span
                                v-if="bookmarkDisplay.bookmark.chartType !== 'list'"
                                class="icon"
                                :style="`font-family: ${axis.iconGroup}; margin-top: 0px`"
                                >{{ axis.icon }}</span
                              >
                              <span>{{ axis.name }}</span>
                            </label>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Atlas Cohort Definition -->
              <div
                v-if="bookmarkDisplay.atlasCohortDefinition"
                style="
                  flex: 1;
                  overflow: auto;
                  margin-bottom: 10px;
                  scrollbar-width: thin;
                  scrollbar-color: #ff5e5977 white;
                  padding: 0px 10px 5px 10px;
                "
              >
                <div style="display: flex; align-items: center; margin-bottom: 10px">
                  <div style="margin-right: 5px"><GlobeIcon /></div>
                  <div class="ui-darkest-text" style="font-weight: bold">Atlas Cohort Definition</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">ID:</div>
                  <div>{{ bookmarkDisplay.atlasCohortDefinition.id }}</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">By:</div>
                  <div>{{ bookmarkDisplay.atlasCohortDefinition.username }}</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">Updated On:</div>
                  <div>{{ bookmarkDisplay.atlasCohortDefinition.updatedOnFormatted }}</div>
                </div>
              </div>
              <!-- MATERIALIZED COHORTS -->
              <div
                v-if="bookmarkDisplay.cohortDefinition"
                style="min-height: 120px; overflow: auto; scrollbar-width: thin; scrollbar-color: #ff5e5977 white"
              >
                <div style="display: flex; align-items: center; margin-bottom: 10px">
                  <div style="margin-right: 5px"><PatientsActiveIcon /></div>
                  <div class="ui-darkest-text" style="font-weight: bold">Materialized Cohort</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">Cohort ID:</div>
                  <div class="ui-light-text">{{ bookmarkDisplay.cohortDefinition.id }}</div>
                </div>
                <div style="display: flex" v-if="!!bookmarkDisplay.cohortDefinition.description">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">Description:</div>
                  <div class="ui-light-text">{{ bookmarkDisplay.cohortDefinition.description }}</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px; white-space: nowrap">
                    Cohort Name:
                  </div>
                  <div class="ui-light-text" style="overflow: hidden; text-overflow: ellipsis">
                    {{ bookmarkDisplay.cohortDefinition.cohortDefinitionName }}
                  </div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">Patient Count:</div>
                  <div class="ui-light-text">{{ formatNumber(bookmarkDisplay.cohortDefinition.patientCount) }}</div>
                </div>
                <div style="display: flex">
                  <div class="ui-darkest-text" style="font-weight: bold; margin-right: 10px">Created On:</div>
                  <div class="ui-light-text">{{ bookmarkDisplay.cohortDefinition.createdOnFormatted }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          class="footer"
          data-testid="pa-cohort-footer"
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: solid 1px #acaba8;
            height: 50px;
            padding: 0px 20px 0px 20px;
          "
        >
          <div
            v-if="!isAtlas"
            :class="`icon-button ${
              ['D', 'D+M'].includes(getBookmarkType(bookmarkDisplay)) ? '' : 'icon-button-disabled'
            }`"
            style="width: 32px; height: 32px; display: flex; justify-content: center; align-items: center"
            @click="['D', 'D+M'].includes(getBookmarkType(bookmarkDisplay)) && onSelectBookmark(bookmarkDisplay)"
            :title="getText('MRI_PA_TOOLTIP_SELECT_BOOKMARK')"
            data-testid="pa-cohort-select-btn"
          >
            <PlusInBoxIcon
              :type="
                !!compareCohortsSelectionList.find(item => item.id === bookmarkDisplay.bookmark?.id) ? 'dark' : 'light'
              "
              :size="24"
            />
          </div>
          <div
            v-if="!isAtlas"
            :class="`icon-button ${
              ['D', 'M', 'D+M'].includes(getBookmarkType(bookmarkDisplay)) && canModify(bookmarkDisplay)
                ? ''
                : 'icon-button-disabled'
            }`"
            style="width: 32px; height: 32px; display: flex; justify-content: center; align-items: center"
            @click.stop="['D', 'M', 'D+M'].includes(getBookmarkType(bookmarkDisplay)) && canModify(bookmarkDisplay) && renameBookmark(bookmarkDisplay)"
            :title="
              canModify(bookmarkDisplay)
                ? getText('MRI_PA_TOOLTIP_RENAME_BOOKMARK')
                : 'You can only modify filters you own'
            "
            :data-testid="`pa-cohort-rename-btn-${getBookmarkType(bookmarkDisplay)}-${bookmarkDisplay.displayName}`"
          >
            <EditIcon />
          </div>

          <div
            :class="`icon-button ${
              ['D', 'D+M', 'A', 'A+M'].includes(getBookmarkType(bookmarkDisplay)) && canDatasetMaterializeCohorts
                ? ''
                : 'icon-button-disabled'
            }`"
            style="width: 32px; height: 32px; display: flex; justify-content: center; align-items: center"
            @click.stop="canDatasetMaterializeCohorts && addCohort(bookmarkDisplay)"
            :title="
              ['D', 'D+M', 'A', 'A+M'].includes(getBookmarkType(bookmarkDisplay)) && canDatasetMaterializeCohorts
                ? getText('MRI_PA_BUTTON_ADD_TO_COLLECTION')
                : getText('MRI_PA_TOOLTIP_MATERIALIZE_DISABLED')
            "
            data-testid="pa-cohort-add-btn"
          >
            <GenerateCohortActiveIcon />
          </div>

          <div
            v-if="!isAtlas"
            :class="`icon-button ${
              ['M', 'A+M', 'D+M'].includes(getBookmarkType(bookmarkDisplay)) ? '' : 'icon-button-disabled'
            }`"
            style="width: 32px; height: 32px; display: flex; justify-content: center; align-items: center"
            :title="getText('MRI_PA_BUTTON_DISPLAY_OR_GENERATE_DATA_QUALITY')"
            @click.stop="openDataQualityDialog(bookmarkDisplay.cohortDefinition)"
          >
            <RunAnalyticsActiveIcon />
          </div>

          <div
            :class="`icon-button ${canModify(bookmarkDisplay) ? '' : 'icon-button-disabled'}`"
            style="width: 32px; height: 32px; display: flex; justify-content: center; align-items: center"
            @click.stop="canModify(bookmarkDisplay) && deleteBookmark(bookmarkDisplay)"
            :title="
              canModify(bookmarkDisplay)
                ? getText('MRI_PA_TOOLTIP_DELETE_BOOKMARK')
                : 'You can only modify filters you own'
            "
            :data-testid="`pa-cohort-delete-btn-${getBookmarkType(bookmarkDisplay)}-${bookmarkDisplay.displayName}`"
          >
            <TrashCanIcon />
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination Footer -->
    <div
      v-if="isAtlas && props.bookmarksDisplay.length > 0"
      style="
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 15px 20px;
        border-top: 1px solid #e0e0e0;
        background-color: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
        font-size: 14px;
        color: #666;
      "
    >
      <!-- Search Bar -->
      <div style="display: flex; align-items: center; gap: 10px">
        <span style="color: #666; font-size: 14px">Search:</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter cohorts..."
          style="
            padding: 6px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            font-size: 14px;
            width: 200px;
            outline: none;
          "
        />
      </div>

      <!-- Pagination Controls -->
      <div style="display: flex; align-items: center; gap: 10px">
        <span style="margin-right: 15px">Items per page:</span>
        <select
          v-model="itemsPerPage"
          style="
            padding: 4px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            font-size: 14px;
            cursor: pointer;
            margin-right: 15px;
          "
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>

        <span style="margin: 0 10px">
          {{ (currentPage - 1) * Number(itemsPerPage) + 1 }}-{{
            Math.min(currentPage * Number(itemsPerPage), bookmarksDisplaySorted.length)
          }}
          of {{ bookmarksDisplaySorted.length }}
        </span>

        <template v-if="totalPages > 1">
          <button
            @click="goToPreviousPage"
            :disabled="currentPage === 1"
            style="
              width: 32px;
              height: 32px;
              border: 1px solid #ddd;
              background: white;
              border-radius: 4px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
            "
            :style="currentPage === 1 ? 'opacity: 0.4; cursor: not-allowed;' : ''"
          >
            ‹
          </button>

          <button
            @click="goToNextPage"
            :disabled="currentPage === totalPages"
            style="
              width: 32px;
              height: 32px;
              border: 1px solid #ddd;
              background: white;
              border-radius: 4px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
            "
            :style="currentPage === totalPages ? 'opacity: 0.4; cursor: not-allowed;' : ''"
          >
            ›
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.icon-button:hover {
  cursor: pointer;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}
.icon-button-disabled,
.icon-button-disabled:hover {
  cursor: default;
  opacity: 0.1;
  box-shadow: none;
}
.item-card {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}
.item-card:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
}
.item-card-body:hover {
  cursor: pointer;
}
.item-card-body-disabled {
  pointer-events: none;
  cursor: none;
}
.item-card-body-disabled:hover {
  cursor: default;
}
.footer:hover {
  cursor: default;
}

.pagination-btn:hover:not(.pagination-btn-disabled) {
  background-color: #3f51b5;
  color: white;
  box-shadow: 0 2px 4px rgba(63, 81, 181, 0.3);
}

.pagination-btn-disabled {
  opacity: 0.4;
  cursor: not-allowed !important;
  pointer-events: none;
}
</style>
