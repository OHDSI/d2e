<template :key="bookmark.name">
  <div class="filtercard-summary" data-testid="pa-filter-summary-panel">
    <div class="header d-flex">
      <label class="summary-title mr-auto">{{ getText('MRI_PA_TITLE_FILTER_SUMMARY') }}</label>
      <label class="separator"></label>
      <div class="spacer"></div>
      <button class="btn btn-sm" @click="unloadBookmark">
        <icon icon="close" />
      </button>
    </div>
    <div class="bookmark-content">
      <ul class="bookmark-list">
        <li v-if="bookmark">
          <template v-for="(container, cIdx) in getCardsFormatted" :key="container.content">
            <div>
              <div v-if="cIdx === 0" class="summary-desc">{{ getText('MRI_PA_FILTER_SUMMARY_DESC_LABEL') }}</div>
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
                        <div class="bookmark-element">{{ attribute.name }}:</div>
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
    <div class="download-cohort-definition" v-if="enableAtlasCohortDefinition">
      <d4l-button
        @click="onClickCreateCohortDefinition"
        :text="getText('MRI_PA_FILTER_SUMMARY_CREATE_ATLAS_COHORT_DEFINITION')"
        :title="getText('MRI_PA_FILTER_SUMMARY_CREATE_ATLAS_COHORT_DEFINITION')"
        classes="button--block"
        :disabled="chartBusy"
      />
    </div>
    <div class="sql-actions">
      <div class="download-sql">
        <d4l-button
          @click="onClickDownloadSql"
          :text="getText('MRI_PA_FILTER_SUMMARY_DOWNLOAD_SQL')"
          :title="getText('MRI_PA_FILTER_SUMMARY_DOWNLOAD_SQL')"
          classes="button--block"
          :disabled="chartBusy"
        />
      </div>
      <div class="copy-sql">
        <d4l-button
          @click="onClickCopySql"
          :text="getText('MRI_PA_FILTER_SUMMARY_COPY_SQL')"
          :title="getText('MRI_PA_FILTER_SUMMARY_COPY_SQL')"
          classes="button--block"
          :disabled="chartBusy"
        />
      </div>
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
import appButton from '../lib/ui/app-button.vue'
import icon from '../lib/ui/app-icon.vue'
import appLabel from '../lib/ui/app-label.vue'
import bsBadge from '../lib/ui/bs-badge.vue'
import messageBox from './MessageBox.vue'
import CreateCohortDefinitionDialog from './CreateCohortDefinitionDialog.vue'
import { getAttributeName, getAdvanceTimeFilterFormatted } from '../utils/filterCardUtils'

export default {
  name: 'filterCardSummary',
  props: ['unloadBookmarkEv', 'chartBusy'],
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
      const boolContainers = this.bookmark.filterCardData

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
      const blob = new Blob([content], { type: 'text/sql' })
      const link = document.createElement('a')
      link.download = `${this.getActiveBookmark?.bookmarkname || 'Untitled'}.sql`
      link.href = URL.createObjectURL(blob)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    },
    async onClickCopySql() {
      const content = this.getResponse()?.data?.sql || ''
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
    icon,
    messageBox,
    appButton,
    appLabel,
    bsBadge,
    CreateCohortDefinitionDialog,
  },
}
</script>

<style scoped>
.sql-actions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 0 10px;
}

.sql-actions .download-sql,
.sql-actions .copy-sql {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  margin: 0;
}

.filter-card-badge {
  color: var(--d2e-color-primary, #000080) !important;
}
</style>
