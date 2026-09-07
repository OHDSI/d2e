<template>
  <div class="filters-footer">
    <!-- "Allow sharing" sits in its own row at the bottom of the side panel, directly above the action buttons. -->
    <div v-if="canShare" class="filters-footer__share" data-testid="pa-share-cohort-row">
      <v-checkbox
        v-model="shareBookmark"
        :label="getText('MRI_PA_BMK_SHARED_BOOKMARK_TEXT')"
        density="compact"
        hide-details
        class="filters-footer__share-checkbox"
        data-testid="pa-share-cohort-checkbox"
      ></v-checkbox>
      <span class="filters-footer__share-info" data-testid="pa-share-cohort-info">
        <v-icon icon="mdi-information-outline" size="16"></v-icon>
        <v-tooltip activator="parent" location="right" max-width="222" content-class="filters-footer__share-tooltip">
          {{ getText('MRI_PA_BMK_SHARED_BOOKMARK_TOOLTIP') }}
        </v-tooltip>
      </span>
    </div>
    <div class="filters-footer__actions d-flex align-items-center" style="justify-content: space-between; width: 100%">
      <div>
        <d4l-button
          class="unicode-icon"
          :text="getRefreshUnicodeCharacter()"
          :title="getText('MRI_PA_TOOLTIP_RESET_FILTERS')"
          @click="openResetDialog"
          style="--border-radius-button: 9999px; margin-left: 8px; margin-right: 8px"
          data-testid="pa-reset-filters-btn"
        />
      </div>
      <div class="d-flex justify-content-center align-items-center">
        <bs-dropdown variant="link" size="sm" no-caret style="margin-left: 8px">
          <template v-slot:button-content>
            <d4l-button
              v-if="!splitAddButton"
              :text="getText('MRI_PA_VB_CREATE_FILTERS')"
              :title="
                this.hasExceededMaxFilterCount
                  ? getText(
                      'MRI_PA_TOOLTIP_CREATE_FILTERS_DISABLED_DUE_TO_EXCEEDING_MAX_FILTERCARD_COUNT',
                      this.maxFiltercardCount
                    )
                  : getText('MRI_PA_TOOLTIP_CREATE_FILTERS')
              "
              :disabled="this.hasExceededMaxFilterCount"
              data-testid="pa-add-filter-btn"
            />
            <d4l-button
              v-else
              :text="getText('MRI_PA_VB_CREATE_FILTERS_INCLUDED')"
              :title="getText('MRI_PA_TOOLTIP_CREATE_FILTERS_INCLUDED')"
            />
          </template>
          <div class="dropdown-scroll">
            <template v-for="item in getFilterCardMenu" :key="item">
              <bs-dropdown-item-button :data-key="item.key" @click="onAddFilterCardMenuItemSelected(item.key)">{{
                item.text
              }}</bs-dropdown-item-button>
            </template>
          </div>
        </bs-dropdown>
        <bs-dropdown v-if="splitAddButton" variant="link" size="sm" no-caret dropup>
          <template v-slot:button-content>
            <d4l-button
              :text="getText('MRI_PA_VB_CREATE_FILTERS_EXCLUDED')"
              :title="getText('MRI_PA_TOOLTIP_CREATE_FILTERS_INCLUDED')"
              style="margin-left: 8px"
            />
          </template>
          <div class="dropdown-scroll">
            <template v-for="item in getFilterCardMenu" :key="item">
              <bs-dropdown-item-button :data-key="item.key" @click="onAddFilterCardMenuItemSelected(item.key, true)">{{
                item.text
              }}</bs-dropdown-item-button>
            </template>
          </div>
        </bs-dropdown>
      </div>
      <div class="d-flex align-items-center">
        <d4l-button
          ref="saveBookmarkButton"
          :disabled="!hasChanges || this.isSavingBookmark"
          :text="getText('MRI_PA_BUTTON_SAVE')"
          :title="getText('MRI_PA_BUTTON_SAVE')"
          @click="openSaveBookmark"
          style="margin-left: 8px; margin-right: 8px"
          data-testid="pa-save-cohort-btn"
        />
      </div>
    </div>

    <messageBox v-if="showSaveBookmark" dim="true" @close="closeSaveBookmark" :busy="getBookmarksLoading">
      <template v-slot:header>{{ getText('MRI_PA_TITLE_SAVE_BOOKMARK') }}</template>
      <template v-slot:body>
        <div>
          <div class="save-bookmark">
            <div class="form-group">
              <div class="name" v-if="this.isNewCohort || this.isNotUserSharedBookmark">
                <div class="row">
                  <div class="col-sm-12 form-check col-form-label">
                    <label v-if="this.isNewCohort">
                      Enter a new name if you would like to overwrite the current name ({{
                        this.getActiveBookmark.bookmarkname
                      }}).
                    </label>
                    <label v-else> Enter a new name for the cohort. </label>
                  </div>
                </div>
                <div class="row">
                  <div class="col">
                    <!-- maxLength for input is this.maxLength+1 to allow invalid-feedback to be shown -->
                    <input
                      class="form-control"
                      :class="{ 'is-invalid': cohortNameValidationState !== 'valid' }"
                      :placeholder="getText('MRI_PA_COLL_ENTER_NAME')"
                      v-model="cohortName"
                      tabindex="0"
                      v-focus
                      required
                      :maxlength="this.maxLength + 1"
                      @keydown.enter="saveBookmark"
                    />
                    <div
                      class="invalid-feedback"
                      v-bind:style="[cohortNameValidationState === 'invalid' && 'display: block;']"
                    >
                      {{ getText('MRI_PA_INVALID_NAME_ERROR') }}
                    </div>
                    <div class="invalid-feedback" v-bind:style="[hasExceededLength && 'display: block;']">
                      Filter name must not exceed 255 characters
                    </div>
                    <div
                      class="invalid-feedback"
                      v-bind:style="[cohortNameValidationState === 'empty' && 'display: block;']"
                    >
                      {{ getText('MRI_PA_BMK_EMPTY_NAME_ERROR') }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template v-slot:footer>
        <div class="flex-spacer"></div>
        <appButton
          :click="saveBookmark"
          :text="getText('MRI_PA_BUTTON_SAVE')"
          :tooltip="getText('MRI_PA_BUTTON_SAVE')"
          :disabled="this.hasExceededLength || getBookmarksLoading || this.isSavingBookmark"
          testId="pa-save-dialog-save-btn"
        ></appButton>
        <appButton
          :click="closeSaveBookmark"
          :text="getText('MRI_PA_BUTTON_CANCEL')"
          :tooltip="getText('MRI_PA_BUTTON_CANCEL')"
          testId="pa-save-dialog-cancel-btn"
        ></appButton>
      </template>
    </messageBox>

    <messageBox dim="true" dialogWidth="400px" v-if="showResetDialog" @close="closeResetDialog">
      <template v-slot:header>{{ getText('MRI_PA_RESET_FILTERS_TITLE') }}</template>
      <template v-slot:body>
        <div>
          <div class="div-reset-text">{{ getText('MRI_PA_TXT_RESET_FILTERS') }}</div>
        </div>
      </template>
      <template v-slot:footer>
        <div class="flex-spacer"></div>
        <appButton
          :click="reset"
          :text="getText('MRI_PA_RESET_FILTERS_OK')"
          :tooltip="getText('MRI_PA_RESET_FILTERS_OK')"
          v-focus
        ></appButton>
        <appButton
          :click="closeResetDialog"
          :text="getText('MRI_PA_BUTTON_CANCEL')"
          :tooltip="getText('MRI_PA_BUTTON_CANCEL')"
        ></appButton>
      </template>
    </messageBox>
  </div>
</template>

<script lang="ts">
import { mapActions, mapGetters, mapMutations, useStore } from 'vuex'
import appButton from '../lib/ui/app-button.vue'
import bsDropdown from '../lib/ui/bs-dropdown.vue'
import bsDropdownItemButton from '../lib/ui/bs-dropdown-item-button.vue'
import * as types from '../store/mutation-types'
import DialogBox from './DialogBox.vue'
import messageBox from './MessageBox.vue'
import { usePortalContext } from '../composables/usePortalContext'
import { useNotificationStore } from '../stores/notifications'
import { useUserRole } from '../composables/useUserRole'

export default {
  name: 'filtersFooter',
  props: {
    splitAddButton: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  setup() {
    const store = useStore()
    const portalContext = usePortalContext()
    const { canShare } = useUserRole()
    return { canShare, portalContext }
  },
  data() {
    return {
      showSaveBookmark: false,
      shareBookmark: false,
      showResetDialog: false,
      saveDialogWidth: 260,
      cohortNameValidationState: 'valid' as 'invalid' | 'valid' | 'empty',
      cohortName: '',
      isSavingBookmark: false,
      maxLength: 255,
      maxFiltercardCount: 10,
    }
  },
  mounted() {
    try {
      // Get maxFiltercardCount from config if available.
      this.maxFiltercardCount =
        this.getMriFrontendConfig?._internalConfig.panelOptions.maxFiltercardCount || this.maxFiltercardCount
    } catch (error) {
      console.error('FilterFooter mounted error:', error)
    }
  },
  computed: {
    ...mapGetters([
      'getFilterCardMenu',
      'getFilterCardCount',
      'getText',
      'getBookmarksData',
      'getBookmarks',
      'getBookmarksLoading',
      'getMriFrontendConfig',
      'getActiveBookmark',
      'getCurrentBookmarkHasChanges',
      'getBookmark',
      'getBookmarkByNameAndUsername',
    ]),
    hasChanges() {
      // For regular D2E bookmarks, use existing logic with null checks
      const shareChanged = this.canShare && this.shareBookmark !== !!this.getActiveBookmark?.shared
      return this.getActiveBookmark?.isNew || this.getCurrentBookmarkHasChanges || shareChanged
    },
    isNewCohort() {
      return this.getActiveBookmark?.isNew
    },
    hasExceededLength() {
      return this.cohortName.length > this.maxLength
    },
    hasExceededMaxFilterCount() {
      const filtercardCount = this.getFilterCardCount({
        excludeBasicCard: true,
        excludedOnly: false,
        matchType: 'matchall',
      })
      return filtercardCount >= this.maxFiltercardCount
    },
    isNotUserSharedBookmark() {
      const username = this.portalContext.username
      return this.getActiveBookmark.shared && username !== this.getActiveBookmark.user_id
    },
    needsSaveDialog() {
      // Only flows that create a new cohort record require a name from the user.
      return this.isNewCohort || this.isNotUserSharedBookmark
    },
  },
  watch: {
    getActiveBookmark: {
      handler(newVal) {
        this.shareBookmark = !!newVal.shared
      },
      immediate: true,
    },
  },
  methods: {
    ...mapActions(['fireBookmarkQuery', 'loadbookmarkToState', 'resetChart', 'queryReset']),
    ...mapMutations([types.CONFIG_SET_HAS_ASSIGNED, types.SET_ACTIVE_BOOKMARK, types.SET_ACTIVE_BOOKMARK_BASELINE]),
    onAddFilterCardMenuItemSelected(configPath, isExclusion = false) {
      this.$emit('add', {
        configPath,
        isExclusion,
        boolFilterContainerId: null,
      })
    },
    openSaveBookmark() {
      // An already-saved cohort owned by the current user saves straight away and reports
      // via the success toast. The dialog is only needed when a name has to be supplied.
      if (this.needsSaveDialog) {
        this.showSaveBookmark = true
        return
      }
      this.saveBookmark()
    },
    closeSaveBookmark() {
      this.showSaveBookmark = false
      this.cohortNameValidationState = 'valid'
    },
    closeResetDialog() {
      this.showResetDialog = false
    },
    openResetDialog() {
      this.showResetDialog = true
    },
    async saveBookmark() {
      if (this.isSavingBookmark) return
      if (this.hasChanges) {
        if (this.hasExceededLength) return

        this.cohortName = this.cohortName.trim()
        const bookmark = this.getBookmarksData
        const activeBookmark = this.getActiveBookmark
        const isNewBookmark = activeBookmark?.isNew || false

        // Check if the new name is empty only for new bookmarks
        if (isNewBookmark && !this.cohortName.length) {
          this.cohortNameValidationState = 'empty'
          return
        }

        const username = this.portalContext.username

        // For updates without a new name, use the existing bookmark name
        const bookmarkName = this.cohortName.length > 0 ? this.cohortName : activeBookmark.bookmarkname

        // Check for duplicate names only if a new name is provided
        if (this.cohortName.length > 0) {
          for (const bookmark of this.getBookmarks) {
            if (username === bookmark.user_id && bookmark.bookmarkname === this.cohortName) {
              this.cohortNameValidationState = 'invalid'
              return
            }
          }
        }

        this.isSavingBookmark = true

        try {
          if (isNewBookmark || this.isNotUserSharedBookmark) {
            const params = {
              cmd: 'insert',
              bookmarkname: bookmarkName,
              shareBookmark: this.shareBookmark,
              bookmark: JSON.stringify(bookmark),
            }
            await this.fireBookmarkQuery({ params, method: 'post', suppressToast: true })
          } else {
            const request = {
              cmd: 'update',
              bookmark: JSON.stringify(bookmark),
              shareBookmark: this.shareBookmark,
            }
            await this.fireBookmarkQuery({
              method: 'put',
              params: request,
              bookmarkId: activeBookmark.bmkId,
              suppressToast: true,
            })
          }

          const successMessage =
            isNewBookmark || this.isNotUserSharedBookmark
              ? this.getText('MRI_PA_SAVE_BMK_SUCCESS')
              : this.getText('MRI_PA_UPDATE_BMK_SUCCESS')

          // Close the dialog right after the save succeeds so the success toast is shown
          // after the modal closes, not while the subsequent list refresh is still running.
          this.closeSaveBookmark()
          useNotificationStore().setToastMessage({ text: successMessage })

          await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
          const savedBookmark = this.getBookmarkByNameAndUsername(bookmarkName, username)
          this[types.SET_ACTIVE_BOOKMARK](savedBookmark)
          this[types.SET_ACTIVE_BOOKMARK_BASELINE](this.getBookmarksData)
        } catch (error) {
          console.error('Error during bookmark save or reload:', error)
        } finally {
          this.isSavingBookmark = false
          this.cohortName = ''
          this.closeSaveBookmark()
        }
      }
    },
    reset() {
      this.queryReset()
      this.resetChart()
      this.closeResetDialog()
    },
    getRefreshUnicodeCharacter() {
      const charSpan = document.createElement('textarea')
      charSpan.innerHTML = '&#8634;'
      return charSpan.value
    },
    showChart() {
      this.$emit('showChart')
    },
    showPatientList() {
      this.$emit('showPatientList')
    },
  },
  components: {
    appButton,
    bsDropdown,
    bsDropdownItemButton,
    DialogBox,
    messageBox,
  },
}
</script>
