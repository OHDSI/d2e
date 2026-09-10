<template>
  <div class="bookmark-container">
    <appMessageStrip
      :messageType="messageStrip.messageType"
      :text="messageStrip.message"
      v-if="messageStrip.show"
      @closeEv="resetMessageStrip"
    />
    <messageBox
      dim="true"
      dialogWidth="400px"
      :busy="isRenamingBookmark"
      v-if="showRenameDialog"
      @close="closeRenameBookmark"
    >
      <template v-slot:header>{{ getText('MRI_PA_BOOKMARK_RENAME_DIALOG_TITLE') }}</template>
      <template v-slot:body>
        <div>
          <div class="div-bookmark-dialog">
            <span>{{ getText('MRI_PA_BOOKMARK_RENAME_DIALOG_TEXT') }}</span>
            <div class="input-container">
              <!-- maxLength for input is this.maxLength+1 to allow invalid-feedback to be shown -->
              <input
                class="form-control"
                v-focus
                required
                :maxlength="this.maxLength + 1"
                v-model="renamedBookmark"
                @keydown.enter="confirmRenameBookmark"
              />
            </div>
            <div class="invalid-feedback" v-bind:style="[cohortNameValidationState === 'invalid' && 'display: block;']">
              {{ getText('MRI_PA_INVALID_NAME_ERROR') }}
            </div>
            <div class="invalid-feedback" v-bind:style="[hasExceededLength && 'display: block;']">
              Filter name must not exceed 255 characters
            </div>
            <div class="invalid-feedback" v-bind:style="[cohortNameValidationState === 'empty' && 'display: block;']">
              {{ getText('MRI_PA_BMK_EMPTY_NAME_ERROR') }}
            </div>
          </div>
        </div>
      </template>
      <template v-slot:footer>
        <div class="flex-spacer"></div>
        <appButton
          :click="confirmRenameBookmark"
          :text="getText('MRI_PA_BUTTON_SAVE')"
          :disabled="this.hasExceededLength || isRenamingBookmark"
        ></appButton>
        <appButton
          :click="closeRenameBookmark"
          :text="getText('MRI_PA_BUTTON_CANCEL')"
          :disabled="isRenamingBookmark"
        ></appButton>
      </template>
    </messageBox>
    <messageBox
      messageType="warning"
      dim="true"
      dialogWidth="400px"
      :busy="isDeletingBookmark"
      v-if="showDeleteDialog"
      @close="closeDeleteBookmark"
    >
      <template v-slot:header>{{ getText('MRI_PA_BOOKMARK_DELETE_DIALOG_TITLE') }}</template>
      <template v-slot:body>
        <div>
          <div class="div-bookmark-dialog">
            <div>{{ getText('MRI_PA_BOOKMARK_DELETE_DIALOG_TEXT') }}</div>
            <div>{{ getText('MRI_PA_BOOKMARK_DELETE_DIALOG_QUESTION_TEXT') }}</div>
          </div>
        </div>
      </template>
      <template v-slot:footer>
        <div class="flex-spacer"></div>
        <appButton
          :click="confirmDeleteBookmark"
          :text="getText('MRI_PA_BUTTON_DELETE')"
          :disabled="isDeletingBookmark"
          v-focus
        ></appButton>
        <appButton
          :click="closeDeleteBookmark"
          :text="getText('MRI_PA_BUTTON_CANCEL')"
          :disabled="isDeletingBookmark"
        ></appButton>
      </template>
    </messageBox>

    <ImportAtlasCohortDefinitionDialog
      v-if="showImportAtlasCohortDefinition"
      @closeEv="closeImportAtlasCohortDefinition"
      @createdEv="loadBookmarks"
    />

    <div class="bookmark-content">
      <div class="bookmark-content__header" ref="bookmarkHeaderRef">
        <div class="bookmark-content__header-title" v-if="!isAtlas">Create Cohort:</div>
        <div class="bookmark-content__header-button-group">
          <Button :text="getText('MRI_PA_CREATE_D2E_COHORT_TEXT')" :onClick="openAddNewCohort" v-if="!isAtlas"></Button>
          <Button
            v-if="useAtlasLite || usePaAtlas"
            :text="isAtlas ? 'Create Cohort' : getText('MRI_PA_CREATE_ATLAS_COHORT_TEXT')"
            :onClick="openAtlasLink"
          >
          </Button>

          <!-- <Button v-if="usePaAtlas" :text="getText('MRI_PA_CREATE_PA_ATLAS_COHORT_TEXT')" :onClick="openAtlasLink">
          </Button> -->

          <Button
            v-if="enableAtlasCohortDefinition"
            :text="isAtlas ? 'Import Cohort' : getText('MRI_PA_IMPORT_ATLAS_COHORT_DEFINITION_TEXT')"
            :onClick="openImportAtlasCohortDefinition"
          >
          </Button>
          <Button
            :text="getText('MRI_PA_COMPARE_D2E_COHORT_TEXT')"
            :onClick="openCompareDialog"
            :disabled="!showCohortCompareBtn"
            v-if="!isAtlas"
          >
          </Button>
          <div class="shared-toggle-container" v-if="!isAtlas">
            {{ getText('MRI_PA_BOOKMARK_SHOW_SHARED_COHORTS_TEXT') }}
            <SlideToggle v-model="showSharedBookmarks" />
          </div>
        </div>
      </div>

      <div class="bookmark-content__break" ref="bookmarkBreakRef" />

      <div class="bookmark-content__body" :style="bookmarkBodyStyle">
        <div v-if="isBookmarksLoading" class="bookmark-content__spinner">
          <d4l-spinner />
        </div>
        <div v-else>
          <div v-if="getBookmarksLoadError" class="bookmark-empty-state bookmark-empty-state--error">
            <LoadErrorIllustration class="bookmark-empty-state__icon bookmark-empty-state__illustration" />
            <div class="bookmark-empty-state__title">{{ getText('MRI_PA_BOOKMARKS_ERROR_TITLE') }}</div>
            <div class="bookmark-empty-state__body">{{ getText('MRI_PA_BOOKMARKS_ERROR_TEXT') }}</div>
            <button class="bookmark-empty-state__refresh" type="button" @click="loadBookmarks">
              <RefreshIcon class="bookmark-empty-state__refresh-icon" />
              {{ getText('MRI_PA_BOOKMARKS_REFRESH') }}
            </button>
          </div>
          <div v-else-if="!bookmarksDisplay || bookmarksDisplay.length === 0" class="bookmark-empty-state">
            <UsersIcon class="bookmark-empty-state__icon bookmark-empty-state__icon--users" />
            <div class="bookmark-empty-state__title">{{ getText('MRI_PA_BOOKMARKS_EMPTY_TITLE') }}</div>
            <div class="bookmark-empty-state__body">{{ getText('MRI_PA_NO_BOOKMARKS_TEXT') }}</div>
          </div>
          <div v-else class="bookmark-content__list">
            <BookmarkItems
              :bookmarksDisplay="bookmarksDisplay"
              :compareCohortsSelectionList="aSelBookmarkList"
              :useQueryFilterForAtlas="usePaAtlas"
              :canDatasetMaterializeCohorts="canDatasetMaterializeCohorts"
              @onSelectBookmark="onSelectBookmark"
              @renameBookmark="renameBookmark"
              @deleteBookmark="deleteBookmark"
              @addCohort="addCohort"
              @openDataQualityDialog="openDataQualityDialog"
              @loadBookmarkCheck="loadBookmarkCheck"
              @loadAtlasBookmark="loadAtlasBookmark"
            />
          </div>
        </div>
      </div>
    </div>

    <cohortComparisonDialog
      v-bind:bookmarkList="aSelBookmarkList"
      :openCompareDialog="showCohortCompareDialog"
      @closeEv="showCohortCompareDialog = false"
    >
    </cohortComparisonDialog>

    <cohortListDialog
      :openListDialog="showCohortListDialog"
      :bookmarkId="this.selectedBookmark?.id"
      :bookmarkName="this.selectedBookmark?.name"
      @closeEv="showCohortListDialog = false"
    >
    </cohortListDialog>

    <addCohort
      :openAddDialog="showAddCohortDialog"
      :bookmarkId="this.selectedBookmark?.id"
      :bookmarkName="this.selectedBookmark?.name"
      @closeEv="showAddCohortDialog = false"
      :cohortDefinitionType="cohortDefinitionType"
      :atlasCohortDefinitionId="atlasCohortDefinitionId"
    >
    </addCohort>

    <messageBox
      dim="true"
      messageType="error"
      dialogWidth="400px"
      v-if="showIncompatibleMessage"
      @close="closeIncompatibleMessage"
    >
      <template v-slot:header>{{ getText('MRI_PA_NOTIFICATION_ERROR') }}</template>
      <template v-slot:body>
        <div>
          <div class="div-reset-text">{{ getText('MRI_PA_BMK_COMPATIBLE_ERROR') }}</div>
        </div>
      </template>
      <template v-slot:footer>
        <div class="flex-spacer"></div>
        <appButton :click="closeIncompatibleMessage" :text="getText('MRI_PA_CLOSE_BUTTON')"></appButton>
      </template>
    </messageBox>
  </div>
</template>

<script lang="ts">
declare var sap: any
import { mapActions, mapGetters, mapMutations } from 'vuex'
import appButton from '../lib/ui/app-button.vue'
import appCheckbox from '../lib/ui/app-checkbox.vue'
import cohortComparisonDialog from './CohortComparisonDialog.vue'
import messageBox from './MessageBox.vue'
import addCohort from './AddCohort.vue'
import cohortListDialog from './CohortListDialog.vue'
import * as types from '../store/mutation-types'
import appMessageStrip from '../lib/ui/app-message-strip.vue'
import BookmarkItems from './BookmarkItems.vue'
import SlideToggle from './SlideToggle.vue'
import { getBookmarkType } from '../utils/BookmarkUtils'
import Button from './Button.vue'
import UsersIcon from './icons/UsersIcon.vue'
import LoadErrorIllustration from './icons/LoadErrorIllustration.vue'
import RefreshIcon from './icons/RefreshIcon.vue'
import ImportAtlasCohortDefinitionDialog from './ImportAtlasCohortDefinitionDialog.vue'
import { useAtlasStore } from '../stores/atlas'
import { usePortalContext } from '../composables/usePortalContext'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
export default {
  name: 'bookmark',
  props: ['unloadBookmarkEv', 'initBookmarkId'],
  setup() {
    return {
      unsavedChanges: useUnsavedChanges(),
    }
  },
  data() {
    return {
      atlasStore: useAtlasStore(),
      portalContext: usePortalContext(),
      maxLength: 255,
      selectedBookmark: {},
      renamedBookmark: '',
      schemaName: '',
      viewName: '',
      showRenameDialog: false,
      showDeleteDialog: false,
      isDeletingBookmark: false,
      isRenamingBookmark: false,
      showSharedBookmarks: false,
      showCopyExtensionDialog: false,
      aSelBookmarkList: [],
      showCohortCompareDialog: false,
      showCohortListDialog: false,
      showAddCohortDialog: false,
      showIncompatibleMessage: false,
      cohortName: 'New cohort',
      cohortNameValidationState: 'valid' as 'invalid' | 'valid' | 'empty',
      selectedBmkId: '',
      selectedChartType: '',
      messageStrip: {
        show: false,
        message: '',
        messageType: '',
      },
      cohortDefinitionType: '',
      atlasCohortDefinitionId: null,
      showImportAtlasCohortDefinition: false,
      bookmarkBodyOffset: 0,
      headerResizeObserver: null as ResizeObserver | null,
    }
  },
  watch: {
    initBookmarkId() {
      if (this.initBookmarkId !== '') {
        // Restore the bookmark referenced by the URL (?bmkId=) on (re)mount.
        // loadBookmark() reads selectedBmkId/selectedChartType, so set them first
        // (mirrors loadBookmarkCheck); passing them as args would be ignored.
        this.selectedBmkId = this.initBookmarkId
        this.selectedChartType = null
        this.loadBookmark()
      }
    },
    isBookmarksLoading() {
      this.$nextTick(() => {
        this.updateBookmarkBodyOffset()
      })
    },
  },
  computed: {
    ...mapGetters([
      'getMriFrontendConfig',
      'getBookmarks',
      'getText',
      'getActiveBookmark',
      'getCurrentBookmarkHasChanges',
      'getDisplayBookmarks',
      'getSelectedDataset',
      'getBookmarksLoading',
      'getBookmarksLoadError',
      'getCanDatasetMaterializeCohorts',
    ]),
    enableAtlasCohortDefinition() {
      return !!this.getMriFrontendConfig?._internalConfig?.panelOptions?.atlasCohortDefinition
    },
    useAtlasLite() {
      return this.enableAtlasCohortDefinition && !this.getMriFrontendConfig?._internalConfig?.panelOptions?.usePaAtlas
    },
    usePaAtlas() {
      return this.enableAtlasCohortDefinition && this.getMriFrontendConfig?._internalConfig?.panelOptions?.usePaAtlas
    },
    canDatasetMaterializeCohorts() {
      return this.getCanDatasetMaterializeCohorts
    },
    bookmarksDisplay() {
      return this.getDisplayBookmarks(this.showSharedBookmarks, this.portalContext.username)
    },
    isAtlas() {
      return import.meta.env.VITE_STANDALONE_ATLAS === 'true'
    },
    showCohortCompareBtn() {
      return this.aSelBookmarkList.length > 1
    },
    hasExceededLength() {
      return this.renamedBookmark.length > this.maxLength
    },
    isBookmarksLoading() {
      return this.bookmarksDisplay.length === 0 && this.getBookmarksLoading
    },
    bookmarkBodyStyle() {
      return {
        top: `${this.bookmarkBodyOffset}px`,
      }
    },
  },
  mounted() {
    this.$nextTick(() => {
      this.updateBookmarkBodyOffset()
      this.setupBookmarkLayoutObserver()
    })
    window.addEventListener('resize', this.updateBookmarkBodyOffset)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateBookmarkBodyOffset)
    this.teardownBookmarkLayoutObserver()
  },
  methods: {
    ...mapActions([
      'fireBookmarkQuery',
      'loadbookmarkToState',
      'fireRenameMaterializedCohortQuery',
      'fireDeleteMaterializedCohortQuery',
      'fireDeleteAtlasCohortDefinitionQuery',
      'fetchDataQualityFlowRun',
      'generateDataQualityFlowRun',
      'resetChart',
    ]),
    ...mapMutations([types.SET_ACTIVE_BOOKMARK, types.SET_ACTIVE_BOOKMARK_BASELINE, types.CONFIG_SET_HAS_ASSIGNED]),
    openCompareDialog() {
      this.showCohortCompareDialog = true
    },
    onSelectBookmark(bookmarkDisplay) {
      const isSelected = !!this.aSelBookmarkList.find(item => item.id === bookmarkDisplay.bookmark.id)
      if (isSelected) {
        this.aSelBookmarkList.splice(this.aSelBookmarkList.indexOf(bookmarkDisplay.bookmark), 1)
      } else {
        this.aSelBookmarkList.push(bookmarkDisplay.bookmark)
      }
    },
    loadBookmarkCheck(bmkId, chartType) {
      if (this.getActiveBookmark && bmkId === this.getActiveBookmark.bmkId) {
        this.$emit('unloadBookmarkEv', false)
        return
      }
      this.selectedBmkId = bmkId
      this.selectedChartType = chartType
      this.unsavedChanges.guard(() => this.loadBookmark())
    },
    loadBookmark() {
      this.loadbookmarkToState({ bmkId: this.selectedBmkId, chartType: this.selectedChartType })
        .then(() => {
          this.$emit('unloadBookmarkEv', false)
          this.selectedBmkId = ''
          this.selectedChartType = ''
        })
        .catch(() => {
          this.showIncompatibleMessage = true
        })
    },
    async loadAtlasBookmark(atlasDefinitionId) {
      this.unsavedChanges.guard(async () => {
        try {
          // Get Atlas JSON using our new store action
          const atlasJson = await this.$store.dispatch('fireGetAtlasCohortDefinitionQuery', atlasDefinitionId)

          // Create a fake bookmark object for the tab display
          const atlasBookmark = {
            bookmarkname: atlasJson.name || `Atlas Cohort ${atlasDefinitionId}`,
            bmkId: `${atlasDefinitionId}`,
            isAtlas: true,
            isNew: false, // Currently always false as we have to import one first
          }

          // Set as active bookmark to create the tab
          this[types.SET_ACTIVE_BOOKMARK](atlasBookmark)

          // Emit event to parent to load Atlas JSON into the correct QueryFilter (in Filters.vue)
          this.$emit('loadAtlasCohortDefinition', atlasJson)

          // Switch to Patient Analytics view after loading
          this.$emit('unloadBookmarkEv', false, true)

          // Allow the QueryFilter to settle before capturing the baseline
          await this.$nextTick()
          this[types.SET_ACTIVE_BOOKMARK_BASELINE](this.$store.getters.getBookmarksData)
        } catch (error) {
          console.error('Failed to load Atlas bookmark:', error)
          this.messageStrip = {
            show: true,
            message: 'Failed to load Atlas cohort definition',
            messageType: 'error',
          }
        }
      })
    },
    closeRenameBookmark() {
      if (this.isRenamingBookmark) return
      this.cohortNameValidationState = 'valid'
      this.showRenameDialog = false
    },
    renameBookmark(bookmarkDisplay) {
      if (bookmarkDisplay) {
        this.selectedBookmark = bookmarkDisplay
        this.renamedBookmark = bookmarkDisplay.displayName
        this.cohortNameValidationState = 'valid'
        this.isRenamingBookmark = false
        this.showRenameDialog = true
      }
    },
    async confirmRenameBookmark() {
      if (this.hasExceededLength || this.isRenamingBookmark) return
      const bookmarkDisplay = this.selectedBookmark

      this.renamedBookmark = this.renamedBookmark.trim()

      // Check if the new name is empty
      if (!this.renamedBookmark.length) {
        this.cohortNameValidationState = 'empty'
        return
      }

      // Check if the new name is already taken
      const username = this.portalContext.username
      for (const bookmark of this.getBookmarks) {
        if (
          username === bookmark.user_id &&
          bookmark.bookmarkname.trim() === this.renamedBookmark &&
          bookmark.bmkId !== this.selectedBookmark.bookmark.id // Exclude the current bookmark
        ) {
          this.cohortNameValidationState = 'invalid'
          return
        }
      }

      this.isRenamingBookmark = true

      try {
        if (this.isMScohort(bookmarkDisplay)) {
          await this.fireRenameMaterializedCohortQuery({
            cohortDefinitionId: bookmarkDisplay.cohortDefinition.id,
            newName: this.renamedBookmark,
          })
          await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
          this.showRenameDialog = false
          this.cohortNameValidationState = 'valid'
          return
        }
        const request = {
          cmd: 'rename',
          newName: this.renamedBookmark,
        }

        await this.fireBookmarkQuery({
          method: 'put',
          params: request,
          bookmarkId: bookmarkDisplay.bookmark.id,
        })
        const activeBookmark = this.getActiveBookmark
        if (activeBookmark && activeBookmark.bmkId === bookmarkDisplay.bookmark.id) {
          // Rename is metadata-only and must not change dirty state. SET_ACTIVE_BOOKMARK
          // clears activeBookmarkBaseline, so preserve and restore it — keeping the exact
          // dirty semantics (clean stays clean, in-progress edits stay dirty) instead of
          // falling back to the fragile legacy raw-JSON comparison.
          const baseline = this.$store.getters.getActiveBookmarkBaseline
          this[types.SET_ACTIVE_BOOKMARK]({ ...activeBookmark, bookmarkname: request.newName })
          if (baseline != null) {
            this[types.SET_ACTIVE_BOOKMARK_BASELINE](baseline)
          }
        }
        await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
        this.showRenameDialog = false
        this.cohortNameValidationState = 'valid'
      } catch (error) {
        console.error('Error renaming bookmark:', error)
      } finally {
        this.isRenamingBookmark = false
      }
    },
    addCohort(bookmarkDisplay) {
      if (bookmarkDisplay?.bookmark) {
        this.selectedBookmark = bookmarkDisplay.bookmark
        this.cohortDefinitionType = 'D2E'
      } else if (bookmarkDisplay.atlasCohortDefinition) {
        this.cohortDefinitionType = 'Atlas'
        this.atlasCohortDefinitionId = bookmarkDisplay.atlasCohortDefinition.id
        this.selectedBookmark = bookmarkDisplay.atlasCohortDefinition
      }
      this.showAddCohortDialog = true
    },
    closeDeleteBookmark() {
      if (this.isDeletingBookmark) return
      this.showDeleteDialog = false
    },
    deleteBookmark(bookmarkDisplay) {
      if (bookmarkDisplay) {
        this.isDeletingBookmark = false
        this.selectedBookmark = bookmarkDisplay
        this.showDeleteDialog = true
      }
    },
    async confirmDeleteBookmark() {
      if (this.isDeletingBookmark) return
      this.isDeletingBookmark = true
      const activeBookmark = this.getActiveBookmark
      const bookmarkDisplay = this.selectedBookmark
      const isMaterializedCohort = getBookmarkType(bookmarkDisplay) === 'M'
      const isD2ECohortDefinition = ['D', 'D+M'].includes(getBookmarkType(bookmarkDisplay))
      const isAtlasCohortDefinition = ['A', 'A+M'].includes(getBookmarkType(bookmarkDisplay))

      try {
        if (isMaterializedCohort) {
          await this.fireDeleteMaterializedCohortQuery(bookmarkDisplay.cohortDefinition.id)
        } else if (isAtlasCohortDefinition) {
          await this.fireDeleteAtlasCohortDefinitionQuery(bookmarkDisplay.atlasCohortDefinition.id)
        } else if (isD2ECohortDefinition) {
          const params = {
            cmd: 'delete',
          }

          await this.fireBookmarkQuery({
            params,
            method: 'delete',
            bookmarkId: bookmarkDisplay.bookmark.id,
          })
        }

        // Close the delete dialog right after the delete succeeds so the success toast is
        // shown after the modal closes instead of expiring behind the still-open modal.
        this.showDeleteDialog = false

        await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
        if (!isMaterializedCohort && activeBookmark && activeBookmark.bookmarkname === bookmarkDisplay.bookmark.name) {
          this[types.SET_ACTIVE_BOOKMARK](null)
          this.reset()
        }
      } catch (error) {
        console.error('Error deleting bookmark:', error)
      } finally {
        this.isDeletingBookmark = false
      }
    },
    onChangeShared({ target }: { target: HTMLInputElement }) {
      console.log(target.checked)
    },
    closeIncompatibleMessage() {
      this.showIncompatibleMessage = false
    },
    openAddNewCohort() {
      this.unsavedChanges.guard(() => this.addNewCohort())
    },
    closeAddNewCohort() {
      this.cohortName = ''
      this.isInvalidName = false
    },
    async addNewCohort() {
      this.cohortName = this.checkCohortName(this.cohortName)
      this[types.SET_ACTIVE_BOOKMARK]({ bookmarkname: this.cohortName, isNew: true })
      this.closeAddNewCohort()
      this.$emit('unloadBookmarkEv', false)
      await this.reset()
      // Let chart defaults that are applied reactively after resetChart (axes /
      // auto-default colorAxis via onChartDataReady) flush before snapshotting the
      // baseline; otherwise it captures the previous cohort's not-yet-reset state.
      await this.$nextTick()
      this[types.SET_ACTIVE_BOOKMARK_BASELINE](this.$store.getters.getBookmarksData)
    },
    checkCohortName(bookmarkName, suffix = '') {
      const username = this.portalContext.username
      let uniqueName = bookmarkName + (suffix ? ` ${suffix}` : '')
      for (const bookmark of this.getBookmarks) {
        if (username === bookmark.user_id && bookmark.bookmarkname === uniqueName) {
          return this.checkCohortName(bookmarkName, suffix ? parseInt(suffix) + 1 : 1)
        }
      }
      return uniqueName
    },
    reset() {
      // Return the promise so callers can await the full reset (setIFRState +
      // setupChartDefaults). Without this, `await this.reset()` resolves
      // immediately and any baseline captured right after reflects pre-reset state.
      return this.resetChart()
    },
    isMScohort(bookmarkDisplay) {
      // MS cohort only contains a cohort definition
      return bookmarkDisplay.cohortDefinition && !bookmarkDisplay.bookmark
    },
    resetMessageStrip() {
      this.messageStrip = {
        show: false,
        message: '',
        messageType: '',
      }
    },
    openDataQualityResultsDialog(flowRun) {
      const job = {
        flowRunId: flowRun.id,
        schemaName: flowRun.parameters.options.schemaName,
        dataCharacterizationSchema: '',
        cohortDefinitionId: flowRun.parameters.options.cohortDefinitionId,
        type: flowRun.tags[0],
        createdAt: flowRun.created,
        completedAt: flowRun.end_time,
        status: flowRun?.state_name,
        error: '',
        datasetId: flowRun.parameters.options.datasetId,
        comment: flowRun.parameters.options.comment,
        databaseCode: flowRun.parameters.options.databaseCode,
      }
      const event = new CustomEvent('alp-results-dialog-open', {
        detail: {
          props: {
            job: job,
          },
        },
      })
      window.dispatchEvent(event)
    },
    async openDataQualityDialog(cohortDefinition) {
      if (cohortDefinition?.id) {
        const flowRun = await this.fetchDataQualityFlowRun({ cohortDefinitionId: cohortDefinition.id })
        if (flowRun && flowRun?.state_name === 'Completed') {
          this.openDataQualityResultsDialog(flowRun)
        } else if (flowRun?.state_name === 'Pending' || flowRun?.state_name === 'RUNNING') {
          this.messageStrip = {
            show: true,
            message: `Data Quality Check is already running`,
            messageType: 'information',
          }
        } else {
          const GenerateDataQualityFlowRunParams = {
            datasetId: this.getSelectedDataset.id,
            comment: '',
            cohortDefinitionId: String(cohortDefinition.id),
            releaseId: '',
            vocabSchemaName: '',
          }
          await this.generateDataQualityFlowRun(GenerateDataQualityFlowRunParams)
            .then(data => {
              this.messageStrip = {
                show: true,
                message: `Data Quality Check created`,
                messageType: 'success',
              }
            })
            .catch(err => {
              this.messageStrip = {
                show: true,
                message: err,
                messageType: 'error',
              }
              return err
            })
        }
      }
    },
    openAtlasLink() {
      if (this.useAtlasLite) {
        // Existing behavior: open atlas-lite
        this.atlasStore.openAtlas('/#/cohortdefinitions')
      } else if (this.usePaAtlas) {
        // New behavior: create empty Atlas bookmark for pa-atlas
        this.openNewAtlasBookmark()
      }
    },
    async openNewAtlasBookmark() {
      this.unsavedChanges.guard(async () => {
        // Create a new Atlas bookmark object
        const atlasBookmark = {
          bookmarkname: 'New Atlas Cohort',
          bmkId: null, // No ID yet as it's new
          isAtlas: true,
          isNew: true,
        }

        // Set as active bookmark
        this[types.SET_ACTIVE_BOOKMARK](atlasBookmark)

        // Pass null Atlas data to initialize empty QueryFilter
        this.$emit('loadAtlasCohortDefinition', null)

        // Switch to Patient Analytics view
        this.$emit('unloadBookmarkEv', false, true)

        // Allow the QueryFilter to settle before capturing the baseline
        await this.$nextTick()
        this[types.SET_ACTIVE_BOOKMARK_BASELINE](this.$store.getters.getBookmarksData)
      })
    },
    openImportAtlasCohortDefinition() {
      this.showImportAtlasCohortDefinition = true
    },
    closeImportAtlasCohortDefinition() {
      this.showImportAtlasCohortDefinition = false
    },
    setupBookmarkLayoutObserver() {
      if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
        return
      }

      this.teardownBookmarkLayoutObserver()

      this.headerResizeObserver = new ResizeObserver(() => {
        this.updateBookmarkBodyOffset()
      })

      const headerEl = this.$refs.bookmarkHeaderRef as HTMLElement | undefined
      const breakEl = this.$refs.bookmarkBreakRef as HTMLElement | undefined

      if (headerEl) {
        this.headerResizeObserver.observe(headerEl)
      }

      if (breakEl) {
        this.headerResizeObserver.observe(breakEl)
      }
    },
    teardownBookmarkLayoutObserver() {
      if (!this.headerResizeObserver) {
        return
      }

      this.headerResizeObserver.disconnect()
      this.headerResizeObserver = null
    },
    updateBookmarkBodyOffset() {
      const headerEl = this.$refs.bookmarkHeaderRef as HTMLElement | undefined
      const breakEl = this.$refs.bookmarkBreakRef as HTMLElement | undefined

      let offset = 0
      if (headerEl) {
        offset += headerEl.offsetHeight
      }

      if (breakEl) {
        const breakStyles = getComputedStyle(breakEl)
        const marginTop = Number.parseFloat(breakStyles.marginTop || '0') || 0
        const marginBottom = Number.parseFloat(breakStyles.marginBottom || '0') || 0
        offset += breakEl.offsetHeight + marginTop + marginBottom
      }

      this.bookmarkBodyOffset = Math.max(offset, 0)
    },
    loadBookmarks() {
      // Failures are tracked in the store (loadError) and rendered as the in-list
      // error state, so swallow the rethrown error here to avoid unhandled rejections.
      this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } }).catch(() => {})
    },
  },
  components: {
    messageBox,
    appButton,
    appCheckbox,
    cohortComparisonDialog,
    addCohort,
    cohortListDialog,
    appMessageStrip,
    BookmarkItems,
    SlideToggle,
    Button,
    ImportAtlasCohortDefinitionDialog,
    UsersIcon,
    LoadErrorIllustration,
    RefreshIcon,
  },
}
</script>
