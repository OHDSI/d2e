<template>
  <D2eDialog
    :model-value="modelValue"
    :busy="cohortBusy"
    :title="dialogTitle"
    data-testid="pa-modal-wrapper"
    @update:model-value="onModelValueUpdate"
  >
    <appMessageStrip
      :messageType="messageStrip.messageType"
      :text="messageStrip.message"
      v-if="messageStrip.show"
      @closeEv="resetMessageStrip"
    />

    <div v-if="cohortDefinitionType === 'D2E'" class="cohort-dialog__description">
      <D2eTextField
        v-model="cohortDescription"
        :label="getText('MRI_PA_COLL_COHORT_MATERIALIZATION_DESCRIPTION')"
        :placeholder="getText('MRI_PA_COLL_ENTER_DESCRIPTION')"
        @keydown.enter="onOkButtonPress"
      />
    </div>

    <!-- TODO: Customize dialog body for Atlas -->
    <p v-if="cohortDefinitionType === 'Atlas' && !messageStrip.show">
      {{ getText('MRI_PA_COLL_CONFIRM_MATERIALIZE') }}
    </p>

    <template #actions>
      <D2eButton variant="secondary" :disabled="cohortBusy" @click="closeWindow">
        {{ getText('MRI_PA_BUTTON_CANCEL') }}
      </D2eButton>
      <D2eButton
        :disabled="cohortBusy || (messageStrip.show && messageStrip.messageType === 'error')"
        :loading="cohortBusy"
        @click="onOkButtonPress"
      >
        {{ getText('MRI_PA_BUTTON_MATERIALIZE') }}
      </D2eButton>
    </template>
  </D2eDialog>
</template>

<script lang="ts">
import { mapActions, mapGetters, mapMutations } from 'vuex'
import { D2eButton, D2eDialog, D2eTextField } from '@d2e/ui'
import appMessageStrip from '../lib/ui/app-message-strip.vue'
import * as types from '../store/mutation-types'

export default {
  name: 'addCohort',
  props: ['bookmarkId', 'bookmarkName', 'modelValue', 'cohortDefinitionType', 'atlasCohortDefinitionId'],
  data() {
    return {
      cohortDescription: '',
      cohortBusy: false,
      messageStrip: {
        show: false,
        message: '',
        messageType: '',
      },
    }
  },
  watch: {
    selectedCollection(newVal, oldVal) {
      if (newVal === 'oldCollection') {
        this.loadOldCollections()
      }
    },
  },
  computed: {
    dialogTitle(): string {
      const base = this.getText('MRI_PA_BUTTON_ADD_TO_COLLECTION')
      return this.bookmarkName ? `${base} (${this.bookmarkName})` : base
    },
    ...mapGetters([
      'getText',
      'getSelectedCohort',
      'getSelectedCollection',
      'getHasExistingCollections',
      'getServiceURL',
      'getAddCohortDialogState',
      'getPLRequest',
      'getSelectedDataset',
      'getJwtTokenValue',
      'getCurrentPatientCount',
    ]),
    patientCount() {
      return this.getCurrentPatientCount
    },
    selectedCohort: {
      get() {
        return this.getSelectedCohort
      },
      set(value) {
        this[types.SET_COHORT_TYPE](value)
      },
    },
    selectedCollection: {
      get() {
        return this.getSelectedCollection
      },
      set(value) {
        this[types.SET_COLLECTION_TYPE](value)
      },
    },
    hasExistingCollection: {
      get() {
        return this.getHasExistingCollections
      },
      set(value) {
        this[types.COLLECTIONS_SET_HASEXISTINGCOLLECTION](value)
      },
    },
    serviceURL: {
      get() {
        return this.getServiceURL
      },
    },
    oldCollection: {
      get() {
        return this.onLoadAddCohortMessageBox()
      },
    },
  },
  methods: {
    ...mapActions([
      'onAddCohortOkButtonPress',
      'fireCreateAtlasMaterializedCohortQuery',
      'loadOldCollections',
      'fireQuery',
      'fireBookmarkQuery',
    ]),
    ...mapMutations([types.SET_COHORT_TYPE, types.SET_COLLECTION_TYPE, types.COLLECTIONS_SET_HASEXISTINGCOLLECTION]),
    onOkButtonPress() {
      try {
        const syntax = JSON.stringify({
          datasetId: this.getSelectedDataset.id,
          bookmarkId: this.bookmarkId,
        })
        this.resetMessageStrip()
        this.cohortBusy = true

        const callbackSuccess = () => {
          setTimeout(() => this.closeWindow(), 1500)
          this.cohortBusy = false
          this.messageStrip = {
            show: true,
            message: this.getText('MRI_PA_COLL_SUCCESS_ADD_PATIENT'),
            messageType: 'success',
          }
          this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
        }
        const failureCallback = err => {
          this.cohortBusy = false
          const errorMessage = err?.message || this.getText('MRI_PA_COLL_FAILURE_ADD_PATIENT')

          this.messageStrip = {
            show: true,
            message: errorMessage,
            messageType: 'error',
          }
          return err
        }
        if (this.cohortDefinitionType === 'D2E') {
          this.onAddCohortOkButtonPress({
            params: {
              datasetId: this.getSelectedDataset.id,
              mriquery: JSON.stringify(this.getPLRequest({ bmkId: this.bookmarkId })),
              name: this.bookmarkName,
              description: this.cohortDescription,
              syntax: syntax,
            },
            url: '/analytics-svc/api/services/cohort',
          })
            .then(callbackSuccess)
            .catch(failureCallback)
        } else {
          this.fireCreateAtlasMaterializedCohortQuery({
            url: `/d2e-webapi/cohortdefinition/${this.atlasCohortDefinitionId}/generate/${this.getSelectedDataset.id}`,
          })
            .then(callbackSuccess)
            .catch(failureCallback)
        }
      } catch (e) {
        console.error(e)
      }
    },
    onModelValueUpdate(open) {
      if (!open) {
        this.closeWindow()
      }
    },
    closeWindow() {
      this.resetMessageStrip()
      this.cohortBusy = false
      this[types.SET_COHORT_TYPE]('subset')
      this[types.SET_COLLECTION_TYPE]('newCollection')
      this.cohortDescription = ''
      this.$emit('update:modelValue', false)
    },
    resetMessageStrip() {
      this.messageStrip = {
        show: false,
        message: '',
        messageType: '',
      }
    },
    onLoadAddCohortMessageBox() {
      this.loadOldCollections({
        params: {},
        url: '/analytics-svc/api/services/collections',
      })
    },
    disableOKButton() {
      if (this.selectedCohort === 'subset') {
        return true
      }
      return false
    },
  },
  components: {
    D2eDialog,
    D2eButton,
    D2eTextField,
    appMessageStrip,
  },
}
</script>
<style scoped>
.cohort-dialog__description {
  margin-bottom: 8px;
}
</style>
