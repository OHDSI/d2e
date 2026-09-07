<template :key="bookmark?.name">
  <div class="filtercard-summary" data-testid="pa-filter-summary-panel">
    <div class="filtercard-summary__header">
      <div class="filtercard-summary__title-row">
        <span class="filtercard-summary__title">{{ getText('MRI_PA_TITLE_FILTER_SUMMARY') }}</span>
        <D2eIconButton
          category="no-stroke"
          size="lg"
          icon="mdi-close"
          :aria-label="getText('MRI_PA_TITLE_FILTER_SUMMARY')"
          @click="unloadBookmark"
        />
      </div>
      <p v-if="displayName" class="filtercard-summary__subtitle">
        <span>{{ getText('MRI_PA_FILTER_SUMMARY_EXPLORATION_COHORT_NAME') }}</span
        ><span class="filtercard-summary__subtitle-name">{{ displayName }}</span>
      </p>
    </div>
    <div class="bookmark-content">
      <div v-if="bookmark && getCardsFormatted.length" class="summary-desc">
        {{ getText('MRI_PA_FILTER_SUMMARY_DESC_LABEL') }}
      </div>
      <div class="bookmark-content__card">
        <ul class="bookmark-list">
          <li v-if="bookmark">
            <template v-for="(container, cIdx) in getCardsFormatted" :key="container.content">
              <div>
                <div class="condition-container and-label" v-if="cIdx > 0">{{ getText('MRI_PA_AND') }}</div>
                <div :class="{ 'bookmark-filter-container': cIdx >= 0 }">
                  <template v-for="(filterCard, fIdx) in container.content" :key="filterCard.name">
                    <div class="condition-container or-label" v-if="fIdx > 0">
                      {{ getText('MRI_PA_OR') }}
                    </div>
                    <div class="bookmark-filtercard">
                      <div>
                        <span class="bookmark-headelement" v-if="cIdx === 0">{{
                          getText('MRI_PA_FILTERCARD_TITLE_BASIC_DATA')
                        }}</span>
                        <span class="bookmark-headelement" v-else>{{ filterCard.name }}</span>
                        <bs-badge v-if="isDisplayBadge(filterCard)" variant="light" class="ml-2 filter-card-badge">{{
                          getBadgeText(filterCard)
                        }}</bs-badge>
                        <span class="bookmark-headelement" v-if="filterCard.isExcluded"
                          >({{ getText('MRI_PA_LABEL_EXCLUDED') }})</span
                        >
                      </div>
                      <template v-for="attribute in filterCard.visibleAttributes" :key="attribute.name">
                        <div class="bookmark-attribute">
                          <div class="bookmark-element">{{ attribute.name }}</div>
                          <div
                            :key="constraint"
                            class="bookmark-element bookmark-constraint"
                            v-for="(constraint, constraintIdx) in attribute.visibleConstraints"
                          >
                            {{ constraint }}{{constraintIdx &lt; attribute.visibleConstraints.length - 1 ? ",": ""}}
                          </div>
                        </div>
                      </template>
                      <template v-if="filterCard.visibleAdvanceTime.length">
                        <template v-for="advanceTimeFilter in filterCard.visibleAdvanceTime" :key="advanceTimeFilter">
                          <div class="bookmark-attribute">
                            <span class="bookmark-element" v-html="advanceTimeFilter"></span>
                          </div>
                        </template>
                      </template>
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </li>
        </ul>
      </div>
    </div>
    <div class="filtercard-summary__actions">
      <D2eButton
        v-if="enableAtlasCohortDefinition"
        variant="primary"
        block
        class="filtercard-summary__action-atlas"
        :disabled="chartBusy"
        @click="onClickCreateCohortDefinition"
      >
        {{ getText('MRI_PA_FILTER_SUMMARY_CREATE_ATLAS_COHORT_DEFINITION') }}
      </D2eButton>
      <D2eButton
        variant="secondary"
        block
        class="filtercard-summary__action-sql"
        :disabled="chartBusy"
        @click="onClickDownloadSql"
      >
        {{ getText('MRI_PA_FILTER_SUMMARY_DOWNLOAD_SQL') }}
      </D2eButton>
      <D2eButton
        variant="secondary"
        block
        class="filtercard-summary__action-sql"
        :disabled="chartBusy"
        @click="onClickCopySql"
      >
        {{ getText('MRI_PA_FILTER_SUMMARY_COPY_SQL') }}
      </D2eButton>
    </div>
    <create-cohort-definition-dialog
      v-if="showCohortDefinitionDownloadDialog"
      @closeEv="showCohortDefinitionDownloadDialog = false"
    ></create-cohort-definition-dialog>
  </div>
</template>

<script lang="ts">
import { mapGetters } from 'vuex'
import { useNotificationStore } from '../stores/notifications'
import { D2eButton, D2eIconButton } from '@d2e/ui'
import appButton from '../lib/ui/app-button.vue'
import appLabel from '../lib/ui/app-label.vue'
import bsBadge from '../lib/ui/bs-badge.vue'
import messageBox from './MessageBox.vue'
import CreateCohortDefinitionDialog from './CreateCohortDefinitionDialog.vue'
import { getAttributeName, getAdvanceTimeFilterFormatted } from '../utils/filterCardUtils'

export default {
  name: 'filterCardSummary',
  /**
   * `explorationName` is optional and only the exploration page passes it.
   * That page deliberately does not set the active bookmark — doing so trips
   * `PatientAnalytics`'s `getActiveBookmark` watcher, which switches to the
   * cohort builder — so the name has to come in from the caller. In the cohort
   * builder the prop is absent and the active bookmark supplies it, unchanged.
   */
  props: ['unloadBookmarkEv', 'chartBusy', 'explorationName'],
  setup() {
    return {
      notificationStore: useNotificationStore(),
    }
  },
  data() {
    return {
      bookmarks: [],
      showCohortDefinitionDownloadDialog: false,
    }
  },
  computed: {
    ...mapGetters([
      'getMriFrontendConfig',
      'getBookmarksData',
      'getText',
      'getAxis',
      'getFilterCard',
      'getActiveBookmark',
      'getResponse',
    ]),
    currentBookmark() {
      return this.getBookmarksData
    },
    /** The caller's name when given, else the active bookmark's. */
    displayName() {
      return this.explorationName || this.getActiveBookmark?.bookmarkname || ''
    },
    bookmark() {
      const bookmarkObj = this.currentBookmark
      let returnValue

      if (bookmarkObj.filter && bookmarkObj.filter.cards) {
        const filterCards = bookmarkObj.filter.cards
        const boolContainers = filterCards.content

        returnValue = {
          filterCardData: boolContainers,
          chartType: bookmarkObj.chartType,
          axisInfo:
            bookmarkObj.chartType === 'list' ? bookmarkObj.filter.selected_attributes : bookmarkObj.axisSelection,
        }
      }
      return returnValue
    },
    getCardsFormatted() {
      // `bookmark` is undefined until the store holds a restored bookmark.
      // The cohort builder always has one by the time this panel opens; the
      // exploration page mounts it while `loadbookmarkToState` is still in
      // flight, so render an empty body rather than throwing.
      const boolContainers = this.bookmark?.filterCardData
      if (!boolContainers) return []

      const returnObj = []
      try {
        for (let i = 0; i < boolContainers.length; i += 1) {
          if (boolContainers[i].content.length > 0) {
            const content = []
            for (let ii = 0; ii < boolContainers[i].content.length; ii += 1) {
              const visibleAdvanceTime = []
              const visibleAttributes = []
              let attributes = boolContainers[i].content[ii].attributes
              let isExcluded = false
              let filterCardName = boolContainers[i].content[ii].name
              const isEntry = boolContainers[i].content[ii].isEntry
              const isExit = boolContainers[i].content[ii].isExit
              // Excluded filter cards have attributes one level further down
              if (!attributes) {
                attributes = boolContainers[i].content[ii].content[0].attributes
                isExcluded = true
                filterCardName = boolContainers[i].content[ii].content[0].name
              }
              for (let iii = 0; iii < attributes.content.length; iii += 1) {
                if (
                  attributes.content[iii].constraints.content &&
                  attributes.content[iii].constraints.content.length > 0
                ) {
                  const name = getAttributeName(attributes.content[iii].configPath, this.getMriFrontendConfig, 'list')
                  const visibleConstraints = []
                  const constraints = attributes.content[iii].constraints
                  for (let iv = 0; iv < constraints.content.length; iv += 1) {
                    if (constraints.content[iv].content) {
                      for (let v = 0; v < constraints.content[iv].content.length; v += 1) {
                        visibleConstraints.push(
                          `${constraints.content[iv].content[v].operator}${constraints.content[iv].content[v].value}`
                        )
                      }
                    } else if (constraints.content[iv].operator === '=') {
                      // NOTE: hardcoded "sProcess" to identify location constraint in genetic filtercard
                      // TODO: remove hardcoded "sProcess" and clean code to handle such exceptions neatly
                      try {
                        const val = JSON.parse(constraints.content[iv].value)
                        if (typeof val === 'object' && val.hasOwnProperty('sProcess')) {
                          visibleConstraints.push(val.text)
                        } else {
                          visibleConstraints.push(constraints.content[iv].value)
                        }
                      } catch (e) {
                        visibleConstraints.push(constraints.content[iv].value)
                      }
                    } else {
                      visibleConstraints.push(`${constraints.content[iv].operator}${constraints.content[iv].value}`)
                    }
                  }
                  const attributeObj = {
                    name,
                    visibleConstraints,
                  }
                  visibleAttributes.push(attributeObj)
                }
              }
              const advanceTimeFilter = boolContainers[i].content[ii].advanceTimeFilter
              for (let iii = 0; advanceTimeFilter && iii < advanceTimeFilter.filters.length; iii += 1) {
                visibleAdvanceTime.push(
                  getAdvanceTimeFilterFormatted(advanceTimeFilter.filters[iii], this.getFilterCard, this.getText)
                )
              }
              const filterCardObj = {
                visibleAdvanceTime,
                visibleAttributes,
                isExcluded,
                isEntry,
                isExit,
                name: filterCardName,
              }
              content.push(filterCardObj)
            }
            const boolContainerObj = {
              content,
              icon: boolContainers[i].op === 'AND' ? '' : '',
              iconGroup: 'app-MRI-icons',
            }
            returnObj.push(boolContainerObj)
          }
        }
      } finally {
        // Handle Incorrect Bookmark Formatting
      }
      return returnObj
    },
    displayShowCohortEntryExit() {
      return this.getMriFrontendConfig._internalConfig.panelOptions.cohortEntryExit
    },
    enableAtlasCohortDefinition() {
      return !!this.getMriFrontendConfig?._internalConfig?.panelOptions?.atlasCohortDefinition
    },
  },
  methods: {
    unloadBookmark() {
      this.$emit('unloadFilterCardSummaryEv')
    },
    onClickDownloadSql() {
      const content = this.getResponse()?.data?.sql || ''
      // Only a chart query fills this. Writing the empty string produces a
      // 0-byte .sql file that looks like a successful export, so refuse and
      // say why instead.
      if (!content) {
        this.notificationStore.setToastMessage({ text: this.getText('MRI_PA_FILTER_SUMMARY_SQL_UNAVAILABLE') })
        return
      }
      const blob = new Blob([content], { type: 'text/sql' })
      const link = document.createElement('a')
      link.download = `${this.displayName || 'Untitled'}.sql`
      link.href = URL.createObjectURL(blob)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    },
    async onClickCopySql() {
      const content = this.getResponse()?.data?.sql || ''
      // Same reason as the download: copying '' and then raising the success
      // toast tells the user it worked when nothing was copied.
      if (!content) {
        this.notificationStore.setToastMessage({ text: this.getText('MRI_PA_FILTER_SUMMARY_SQL_UNAVAILABLE') })
        return
      }
      await navigator.clipboard.writeText(content)
      this.notificationStore.setToastMessage({ text: this.getText('MRI_PA_FILTER_SUMMARY_SQL_COPIED') })
    },
    onClickCreateCohortDefinition() {
      this.showCohortDefinitionDownloadDialog = true
    },

    isDisplayBadge(filterCard) {
      return this.displayShowCohortEntryExit && (filterCard.isEntry || filterCard.isExit)
    },
    getBadgeText(filterCard) {
      return filterCard.isEntry
        ? this.getText('MRI_PA_CHART_ENTRY')
        : filterCard.isExit
          ? this.getText('MRI_PA_CHART_EXIT')
          : ''
    },
  },
  components: {
    D2eButton,
    D2eIconButton,
    messageBox,
    appButton,
    appLabel,
    bsBadge,
    CreateCohortDefinitionDialog,
  },
}
</script>

<style scoped lang="scss">
.filtercard-summary {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--d2e-font-family);

  &__header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 16px 8px;
  }

  &__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__title {
    flex: 1 1 auto;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--d2e-color-primary);
  }

  &__subtitle {
    margin: 0;
    font-size: 14px;
    font-weight: 400;
    color: var(--d2e-color-neutral);
  }

  &__subtitle-name {
    font-weight: 600;
  }
}

.bookmark-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 16px 16px;
  font-size: 12px;

  &__card {
    border: 1px solid var(--d2e-color-neutral-lighter);
    border-radius: var(--d2e-radius-md);
    padding: 16px;
  }

  ul.bookmark-list li {
    width: 100%;
  }

  .summary-desc {
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 400;
    color: var(--d2e-color-neutral);
  }

  .bookmark-headelement {
    font-size: 14px;
    line-height: 19px;
    font-weight: 600;
    color: var(--d2e-color-neutral-black);
  }

  .bookmark-filtercard {
    .bookmark-attribute {
      display: flex;
      flex-direction: column;
      padding-top: 4px;
    }

    .bookmark-element {
      font-size: 12px;
      font-weight: 400;
      color: var(--d2e-color-neutral);
    }

    .bookmark-constraint {
      color: var(--d2e-color-primary);
      font-weight: 600;
    }
  }

  .condition-container {
    display: inline-block;
    font-size: 12px;
    line-height: 13px;
    padding: 4px 13px;
    border-radius: 4px;
    margin-top: 7px;
    margin-bottom: 7px;
    color: var(--d2e-color-neutral-xtra-lightest);
  }

  .and-label {
    background-color: var(--d2e-color-primary);
  }

  .or-label {
    background-color: var(--d2e-color-neutral-lighter);
    color: var(--d2e-color-neutral-black);
  }
}

.filtercard-summary__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--d2e-color-neutral-lighter);
}

.filtercard-summary__action-atlas {
  // D2eButton's label weight is --d2e-font-button-weight (500); the frame
  // asks for 600 on this button only, so override it here rather than the
  // shared token.
  :deep(.v-btn__content) {
    font-weight: 600;
  }
}

.filtercard-summary__action-sql {
  // D2eButton's `secondary` variant outlines in --d2e-color-primary; the
  // frame outlines in --d2e-color-primary-lightest, same override
  // ExplorationsPage.vue applies to the card's Materialize button.
  &.v-btn--variant-outlined {
    border-color: var(--d2e-color-primary-lightest);
  }
}

.filter-card-badge {
  color: var(--d2e-color-primary) !important;
}
</style>
