<template>
  <div :class="['pa-component-wrapper']">
    <AtlasView v-if="atlasStore.showAtlas" />
    <ExplorationsPage v-if="displayCohorts" @open-exploration="loadExploration" />
    <div v-else :class="['fullHeight', 'pa-splitter', { 'right-pane-opened': rightPaneEverOpened }]">
      <splitpanes class="default-theme" @resize="onSplitterDrag($event)">
        <pane :size="paneSize" :min-size="hideLeftPane ? 0 : splitterMinWidth">
          <div id="pane-left" class="split" data-testid="pa-pane-left">
            <div class="panel-header filters-toolbar d-flex">
              <div v-if="!isAtlasBookmark">
                <button
                  type="button"
                  class="actionButton"
                  @click="togglePanel(PANEL.RIGHT)"
                  :title="getText('MRI_PA_TOOLTIP_ENTER_EXPANDED_FILTERS_VIEW')"
                  data-testid="pa-fullscreen-btn"
                >
                  <icon icon="fullScreen" />
                </button>
              </div>
              <div class="flex-grow-1 nav-container">
                <ul class="nav nav-justified">
                  <li class="nav-item" @click="toggleCohorts(true)">
                    <a class="nav-link" :class="{ active: displayCohorts }" href="javascript:void(0)">{{
                      getText('MRI_PA_VIEW_COHORT_TITLE')
                    }}</a>
                  </li>
                  <li class="nav-item" @click="toggleCohorts(false, this.isAtlasBookmark)" v-show="hasActiveBookmark">
                    <a class="nav-link" :class="{ active: !displayCohorts }" href="javascript:void(0)">{{
                      this.getActiveBookmarkName()
                    }}</a>
                  </li>
                </ul>
              </div>
            </div>
            <div class="pane-left-content">
              <filters ref="filtersRef" v-if="!showQueryFilter && !displayCohorts"></filters>

              <QueryFilter
                v-else-if="showQueryFilter"
                ref="queryFilterRef"
                :atlas-data="atlasDataForQueryFilter"
                :key="atlasDataForQueryFilter?.id || 'new-cohort'"
              />
            </div>
          </div>
        </pane>

        <pane :size="PANE_SIZE.FULL - paneSize">
          <div id="pane-right" class="split" data-testid="pa-pane-right">
            <template v-if="rightPaneEverOpened">
              <chartToolbar
                :showUnHideFilters="hideLeftPane"
                @unhideEv="togglePanel(PANEL.LEFT)"
                @drilldown="onDrilldown"
                @open-filtersummary="toggleFilterCardSummary($event)"
                v-if="getMriFrontendConfig"
              ></chartToolbar>
              <!-- "ref" used in solution from similar issue: https://github.com/antoniandre/splitpanes/issues/157 -->
              <div class="d-flex pane-right-content" ref="pane-right-content">
                <chartController
                  @setChartBusy="setChartBusy"
                  :chartBusy="chartBusy"
                  :showLeftPane="!hideLeftPane"
                  @drilldown="onDrilldown"
                  :class="{ 'has-filtercard-summary': displayFilterCardSummary }"
                  :shouldRerenderChart="shouldRerenderChart"
                ></chartController>
                <filterCardSummary
                  :chartBusy="chartBusy"
                  @unloadFilterCardSummaryEv="toggleFilterCardSummary(false)"
                  v-if="displayFilterCardSummary"
                >
                </filterCardSummary>
              </div>
            </template>
            <resizeObserver @notify="onSplitterResize" />
          </div>
        </pane>
      </splitpanes>
    </div>
    <div
      v-if="showChartAndListModal"
      style="
        height: 100vh;
        width: 100vw;
        position: fixed;
        left: 0px;
        top: 0px;
        background-color: rgba(0, 0, 0, 0.6);
        padding: 30px;
        z-index: 100;
      "
    >
      <div
        style="
          display: flex;
          flex-direction: column;
          height: calc(100vh - 60px);
          width: 100%;
          background-color: white;
          margin: 0px;
          border-radius: 20px;
          overflow: hidden;
        "
      >
        <chartToolbar
          :showUnHideFilters="hideLeftPane"
          @unhideEv="togglePanel(PANEL.LEFT)"
          @open-filtersummary="toggleFilterCardSummary($event)"
          @toggleChartAndListModal="toggleChartAndListModal"
          v-if="getMriFrontendConfig"
        >
        </chartToolbar>
        <div style="flex: 1; height: calc(100% - 130px); display: flex">
          <chartController
            @setChartBusy="setChartBusy"
            :chartBusy="chartBusy"
            @drilldown="onDrilldown"
            :class="{ 'has-filtercard-summary': displayFilterCardSummary }"
            :shouldRerenderChart="shouldRerenderChart"
          ></chartController>
          <filterCardSummary
            @unloadFilterCardSummaryEv="toggleFilterCardSummary(false)"
            v-if="displayFilterCardSummary"
          >
          </filterCardSummary>
        </div>
      </div>
    </div>
    <!-- <messageBox v-if="!supportedBrowser && !clearBrowserMessage" messageType="warning" dim="true" dialogWidth="300px">
      <template v-slot:header>{{ getText('MRI_PA_NOTIFICATION_ERROR') }}</template>
      <template v-slot:body>
        <div>
          <div style="padding: 24px; max-width: 400px">
            {{ getText('MRI_PA_BROWSER_UNSUPPORTED') }}
            <appLink
              href=""
              :target="_blank"
              :text="getText('MRI_PA_ADMIN_GUIDE_LINK')"
              :title="getText('MRI_PA_ADMIN_GUIDE_LINK')"
            />
          </div>
        </div>
      </template>
      <template v-slot-footer>
        <div class="flex-spacer"></div>
        <appButton :click="dismissBrowserMessage" :text="getText('MRI_PA_BUTTON_OK')" v-focus></appButton>
      </template>
    </messageBox> -->
    <messageToast />
  </div>
</template>

<script lang="ts">
declare var sap
const myWindow: any = window

import { mapActions, mapGetters } from 'vuex'
import { registerPaTools } from '@/ai/webmcpServer'
import { publishPaTools } from '@/ai/paToolBridge'
import icon from '../lib/ui/app-icon.vue'
import appButton from '../lib/ui/app-button.vue'
import appIcon from '../lib/ui/app-icon.vue'
import appLink from '../lib/ui/app-link.vue'
import ExplorationsPage from './ExplorationsPage.vue'
import ChartController from './ChartController.vue'
import ChartToolbar from './ChartToolbar.vue'
import FilterCardSummary from './FilterCardSummary.vue'
import filters from './Filters.vue'
import MessageBox from './MessageBox.vue'
import MessageToast from './MessageToast.vue'
import SplashScreen from './SplashScreen.vue'
import ResizeObserver from './ResizeObserver.vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import { QueryFilter } from '@/query-filter'
import AtlasView from '../views/AtlasView.vue'
import { useAtlasStore } from '../stores/atlas'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'

const PANE_SIZE = {
  FULL: 100,
  HIDDEN: 0,
  OPEN: 30,
}
const PANEL = {
  RIGHT: 'right',
  LEFT: 'left',
}

export default {
  name: 'patientanalytics',
  setup() {
    return {
      unsavedChanges: useUnsavedChanges(),
    }
  },
  data() {
    return {
      displayCohorts: true,
      displayFilterCardSummary: false,
      supportedBrowser: true,
      clearBrowserMessage: false,
      displayFilterCards: false,
      querystring: {
        bmkId: '',
      },
      isStudyMenuOpen: true,
      portalSidebarWidth: document.querySelector('.information__studies')?.clientWidth || 0,
      shouldRerenderChart: false,
      showChartAndListModal: false,
      paneSize: PANE_SIZE.FULL,
      chartBusy: false,
      PANE_SIZE,
      PANEL,
      splitterMinWidth: 0,
      showQueryFilter: false,
      atlasDataForQueryFilter: null,
      rightPaneEverOpened: false,
      atlasStore: useAtlasStore(),
    }
  },
  created() {},
  watch: {
    'querystring.bmkId'(bmkId) {
      // Restore the bookmark referenced by the URL (?bmkId=). This watch used to
      // live in Bookmarks.vue, which is no longer mounted.
      if (bmkId) {
        this.loadExploration(bmkId)
      }
    },
    getActiveBookmark(newVal, oldVal) {
      // Auto-switch to cohort view when a bookmark is loaded (e.g., from deep link)
      // Only trigger when going from no bookmark to having one
      if (newVal && !oldVal && this.displayCohorts) {
        this.toggleCohorts(false)
      }
    },
    getDatasetReloadInProgress(inProgress, wasInProgress) {
      // When a dataset/release switch finishes, the previous bookmark has been
      // cleared (datasetWatcher commits SET_ACTIVE_BOOKMARK null). Reset the view
      // to the default empty state once the new config is loaded.
      if (wasInProgress && !inProgress) {
        this.resetToDefaultView()
      }
    },
    getBookmarkFromIFR(bm) {
      // In patient list, changePage is watched and already calls setFireRequest once
      // It seems like if both are run, `setFireRequest` runs consecutively in the same tick,
      // and the `getFireRequest` watcher is unable to pick up a diff, hence no api call is made
      if (this.getPLModel.currentPage !== 1) {
        this.changePage(1)
      } else {
        this.setFireRequest()
      }
    },
    getActiveChart() {
      this.chartBusy = false
    },
    getHasAssignedConfig(val) {
      if (val) {
        this.completeInitialLoad()
        this.loadDefaultFilters()
        this.loadValuesForAttributePath({
          attributePathUid: 'conceptSets',
          searchQuery: '',
          attributeType: 'conceptSet',
        })
        if (!this.getDatasetReloadInProgress) {
          this.loadAllSharedBookmark()
          this.initializeBookmarks()
        }
      }
    },
  },
  mounted() {
    const paToolHooks = {
      // Let pa_new_cohort switch from the saved-cohort list to the builder so a
      // programmatically built cohort renders and computes its count/chart.
      showBuilder: () => this.toggleCohorts(false),
    }
    // Two consumers, one tool set: an external browser agent via Chrome's
    // modelContext, and an in-page consumer via the window registry. Both wrap
    // the same createPaTools() array.
    this._unregisterPaTools = registerPaTools(this.$store, paToolHooks)
    this._unpublishPaTools = publishPaTools(this.$store, paToolHooks)
    this.updateMinSplitterWidth()
    window.addEventListener('resize', this.updateMinSplitterWidth)
  },
  beforeUnmount() {
    this._unregisterPaTools?.()
    this._unpublishPaTools?.()
    window.removeEventListener('resize', this.updateMinSplitterWidth)
    this.chartBusy = false
  },
  computed: {
    ...mapGetters([
      'getMriFrontendConfig',
      'getHasAssignedConfig',
      'getInitialLoad',
      'getText',
      'getChartSelection',
      'getAllChartConfigs',
      'getBookmarkFromIFR',
      'getActiveChart',
      'getPLModel',
      'getActiveBookmark',
      'getBookmarkById',
      'getDatasetReloadInProgress',
    ]),
    initBookmarkId() {
      const url = window.location.href
      let bookmarkId = ''
      if (url.split('?').length > 1) {
        const queryString = url.split('?')[1]
        const queryParams = queryString.split('&')
        if (queryParams.length > 0) {
          for (let i = 0; i < queryParams.length; i++) {
            const param = queryParams[i].split('=')
            if (param[0] === 'bmkId') {
              bookmarkId = param[1]
              break
            }
          }
        }
      }
      return bookmarkId
    },
    hideLeftPane() {
      return this.paneSize === PANE_SIZE.HIDDEN
    },
    hasActiveBookmark() {
      return !!this.getActiveBookmark
    },
    isAtlasBookmark() {
      return this.getActiveBookmark && this.getActiveBookmark.isAtlas
    },
  },
  methods: {
    ...mapActions([
      'setSplitterSize',
      'completeInitialLoad',
      'fireBookmarkQuery',
      'loadSharedBookmarkList',
      'queryGenomicsSettings',
      'setFireRequest',
      'setupChartDefaults',
      'setIFRState',
      'drilldown',
      'changePage',
      'setActiveChart',
      'loadbookmarkToState',
      'setAddNewCohort',
      'fireCheckIfDatasetCanMaterializeCohorts',
      'setRightPaneMounted',
      'loadValuesForAttributePath',
    ]),
    loadDefaultFilters() {
      this.setIFRState({ ifr: this.getMriFrontendConfig.getInitialIFR() })
      this.setupChartDefaults()
    },
    resetToDefaultView() {
      // Default empty state: full-width Cohorts list, no right chart pane, no
      // query filter, no filter-card summary, and filters reset to the config's
      // initial IFR (clears any retained filter-card selections).
      this.displayCohorts = true
      this.showQueryFilter = false
      this.displayFilterCardSummary = false
      this.paneSize = PANE_SIZE.FULL
      this.rightPaneEverOpened = false
      this.setRightPaneMounted(false)
      this.loadDefaultFilters()
    },
    loadAllBookmark() {
      const params = {
        cmd: 'loadAll',
      }
      return this.fireBookmarkQuery({ params, method: 'get' })
    },
    initializeBookmarks() {
      this.fireCheckIfDatasetCanMaterializeCohorts()
      return this.loadAllBookmark().then(() => (this.querystring.bmkId = this.initBookmarkId))
    },
    loadAllSharedBookmark() {
      const chartConfig = this.getAllChartConfigs
      if (chartConfig && chartConfig.shared && chartConfig.shared.enabled) {
        this.loadSharedBookmarkList()
      }
    },
    dismissBrowserMessage() {
      this.clearBrowserMessage = true
    },
    toggleQueryFilter(show) {
      this.showQueryFilter = show
      this.displayCohorts = !show
    },
    loadExploration(bmkId, chartType = null) {
      // Mirrors Bookmarks.loadBookmark: guard unsaved filter changes, load the
      // bookmark into the store, then swap to the splitter view.
      this.unsavedChanges.guard(() => {
        this.loadbookmarkToState({ bmkId, chartType })
          .then(() => this.toggleCohorts(false))
          .catch(() => {})
      })
    },
    toggleCohorts(isDisplayCohort, isPaAtlas = false) {
      if (isDisplayCohort) {
        this.toggleQueryFilter(false)
      } else {
        if (isPaAtlas) {
          this.togglePanel('right', true)
          this.toggleQueryFilter(true)
        } else {
          if (this.paneSize === PANE_SIZE.FULL) this.togglePanel('right')
          this.toggleQueryFilter(false)
        }
      }
      this.displayCohorts = isDisplayCohort
    },
    toggleFilterCardSummary(displayFilterCardSummary) {
      this.displayFilterCardSummary = displayFilterCardSummary
      // Need to wait for 'has-filtercard-summary' to happen in this tick so the rerender calculates correctly
      this.$nextTick(() => {
        this.rerenderStackBarChart()
      })
    },
    togglePanel(panel, isPaAtlas = false) {
      if (panel === PANEL.LEFT) {
        this.paneSize = this.paneSize > 0 ? PANE_SIZE.HIDDEN : this.splitterMinWidth
      } else if (panel === PANEL.RIGHT && isPaAtlas) {
        this.paneSize = PANE_SIZE.FULL
      } else if (panel === PANEL.RIGHT) {
        this.paneSize = this.paneSize === PANE_SIZE.FULL ? this.splitterMinWidth : PANE_SIZE.FULL
      }
      if (panel === PANEL.RIGHT) {
        this.rightPaneEverOpened = true
        this.setRightPaneMounted(true)
      }
    },

    onSplitterDrag(event) {
      const newSize = event?.[0]?.size ?? this.paneSize
      this.paneSize = newSize
      if (!this.rightPaneEverOpened && newSize < PANE_SIZE.FULL) {
        this.rightPaneEverOpened = true
        this.setRightPaneMounted(true)
      }
    },

    toggleChartAndListModal(toggle) {
      this.showChartAndListModal = toggle
    },
    onSplitterResize() {
      this.rerenderStackBarChart()
    },
    onDrilldown() {
      const chartSelectionDuplicate = JSON.parse(JSON.stringify(this.getChartSelection()))
      const aSelectedData = this.reverseTranslate(chartSelectionDuplicate)
      this.drilldown({ aSelectedData })
    },
    setChartBusy(status: boolean) {
      this.chartBusy = status
    },
    getActiveBookmarkName() {
      if (this.getActiveBookmark) {
        return this.getActiveBookmark.bookmarkname
      } else {
        return ''
      }
    },
    getTranslationList() {
      return this.getMriFrontendConfig
        .getAttributeList()
        .map(attribute => this.getText('MRI_PA_NO_VALUE_CUSTOM', attribute.oInternalConfigAttribute.name))
    },
    reverseTranslate(obj, list) {
      if (!list) {
        // tslint:disable-next-line:no-parameter-reassignment
        list = this.getTranslationList()
      }
      Object.keys(obj).forEach(k => {
        switch (typeof obj[k]) {
          case 'object':
            this.reverseTranslate(obj[k], list)
            break
          case 'string':
            obj[k] = this.reverseTranslateText(obj[k], list)
            break
          default:
            break
        }
      })
      return obj
    },
    reverseTranslateText(str, list) {
      if (list.indexOf(str) > -1 || str === this.getText('MRI_PA_NO_VALUE')) {
        return 'NoValue'
      }
      return str
    },
    rerenderStackBarChart() {
      this.shouldRerenderChart = true
      setTimeout(() => {
        this.shouldRerenderChart = false
      }, 10)
    },
    onClickBackToFiltering() {
      this.showChartAndListModal = false
    },
    onClickShowList() {
      this.setActiveChart('list')
      this.showChartAndListModal = true
    },
    onClickShowChart() {
      this.shouldRerenderChart = true
      this.setActiveChart('stacked')
      this.showChartAndListModal = true
    },
    closeChartListModal() {
      this.toggleChartAndListModal(false)
    },
    updateMinSplitterWidth() {
      this.splitterMinWidth = (400 / window.innerWidth) * 100
    },
    async handleLoadAtlasCohortDefinition(atlasJson) {
      try {
        // IMPORTANT: Set the data BEFORE showing QueryFilter to avoid race condition
        if (atlasJson === null) {
          // Clear any existing data and set null for empty initialization
          this.atlasDataForQueryFilter = null
        } else {
          // Set the Atlas JSON data
          this.atlasDataForQueryFilter = atlasJson
        }

        // Ensure QueryFilter is shown AFTER setting the data
        if (!this.showQueryFilter) {
          this.toggleQueryFilter(true)
        }

        // Wait for component to be mounted and reactive updates to propagate
        await this.$nextTick()
      } catch (error) {
        console.error('Error setting Atlas data:', error)
      }
    },
  },
  components: {
    icon,
    appButton,
    appLink,
    ExplorationsPage,
    ChartToolbar,
    ChartController,
    filters,
    FilterCardSummary,
    MessageBox,
    MessageToast,
    SplashScreen,
    ResizeObserver,
    appIcon,
    Splitpanes,
    Pane,
    QueryFilter,
    AtlasView,
  },
}
</script>

<style scoped>
.pa-splitter:not(.right-pane-opened) :deep(.splitpanes__splitter) {
  pointer-events: none;
  opacity: 0;
}

/* splitpanes animates pane width (transition: width .2s) by default, which makes
   the left pane visibly slide in when returning to Cohorts or resetting the view.
   Keep pane sizing static. */
.pa-splitter :deep(.splitpanes__pane) {
  transition: none;
}
</style>
