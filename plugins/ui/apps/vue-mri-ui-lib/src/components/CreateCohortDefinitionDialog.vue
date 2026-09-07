<template>
  <messageBox @close="cancel">
    <template v-slot:header>{{ getText('MRI_PA_FILTER_SUMMARY_CREATE_COHORT_DEFINITION') }}</template>
    <template v-slot:body>
      <div>
        <div style="padding: 24px">{{ getText('MRI_PA_FILTER_SUMMARY_CREATE_COHORT_DEFINITION_WARNING') }}</div>
      </div>
    </template>
    <template v-slot:footer>
      <div class="flex-spacer"></div>
      <appButton
        :click="onClickCreateCohortDefinition"
        :text="getText('MRI_PA_FILTER_SUMMARY_CREATE_COHORT_DEFINITION_DOWNLOAD')"
        v-focus
        :disabled="isLoading"
      ></appButton>
      <appButton :click="cancel" :text="getText('MRI_PA_BUTTON_CANCEL')"></appButton>
    </template>
  </messageBox>
</template>

<script lang="ts">
import { mapActions, mapGetters } from 'vuex'
import appButton from '../lib/ui/app-button.vue'
import LoadingAnimation from './LoadingAnimation.vue'
import messageBox from './MessageBox.vue'
import { usePortalContext } from '../composables/usePortalContext'
import { convertIFRToExtCohort } from '../utils/IfrToExtCohort'

export default {
  name: 'download-cohort-definition-dialog',
  /**
   * `cohortName` is the exploration the caller is showing. The exploration
   * page opens this dialog without setting the active bookmark — doing so
   * switches PatientAnalytics to the cohort builder — so the active bookmark
   * there is a stale leftover, or absent. Falling back to it named the new
   * Atlas cohort after whatever was last opened.
   */
  props: ['closeEv', 'cohortName'],
  data() {
    const portalContext = usePortalContext()
    return {
      portalContext,
      isLoading: false,
    }
  },
  computed: {
    ...mapGetters([
      'getText',
      'getCohortDefinitionResponse',
      'getActiveBookmark',
      'getSelectedDataset',
      'getActiveBookmark',
      'getBookmarksData',
      'getIFR',
      'getBookmarkFromIFR',
      'getMriFrontendConfig',
    ]),
  },
  watch: {},
  methods: {
    ...mapActions([
      'setFireDownloadZIP',
      'cancelCohortDefinitionQuery',
      'fireD2EToAtlasCohortDefinitionQuery',
      'fireCreateAtlasCohortDefinitionQuery',
      'fireBookmarkQuery',
    ]),
    cancel() {
      if (this.busy) {
        this.cancelCohortDefinitionQuery()
      }
      this.$emit('closeEv')
    },
    async onClickCreateCohortDefinition() {
      this.isLoading = true
      const IFRDefinition = { filter: this.getIFR }
      const datasetId = this.getSelectedDataset?.id
      try {
        const expression = await convertIFRToExtCohort(
          IFRDefinition,
          datasetId,
          this.getMriFrontendConfig.getPaConfigId()
        )
        const now = +new Date()
        const content = {
          id: 0, // 0 is used by webapi for new cohort definitions
          name: this.cohortName || this.getActiveBookmark?.bookmarkname || 'Atlas Cohort Definition',
          tags: [],
          createdBy: this.portalContext.username,
          expression,
          modifiedBy: this.portalContext.username,
          createdDate: now,
          description: 'Generated from a D2E Cohort Definition',
          modifiedDate: now,
          expressionType: 'SIMPLE_EXPRESSION',
        }

        await this.fireCreateAtlasCohortDefinitionQuery({
          content,
        })
        await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
        this.$emit('closeEv')
      } catch (error) {
        console.error('Error converting IFR to external cohort:', error)
      } finally {
        this.isLoading = false
      }
    },
  },
  components: {
    messageBox,
    LoadingAnimation,
    appButton,
  },
}
</script>
