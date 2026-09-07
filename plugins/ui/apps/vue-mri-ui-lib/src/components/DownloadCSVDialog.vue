<template>
  <D2eDialog
    :model-value="true"
    :busy="busy"
    :title="getText('MRI_PA_PATIENT_LIST_DOWNLOAD_AS_CSV')"
    data-testid="pa-modal-wrapper"
    @close="cancel"
  >
    <p>{{ getText('MRI_PA_PATIENT_LIST_DOWNLOAD_AS_CSV_FULL') }}</p>
    <template #actions>
      <D2eButton
        variant="secondary"
        data-testid="pa-download-csv-cancel-btn"
        @click="cancel"
      >
        {{ getText('MRI_PA_BUTTON_CANCEL') }}
      </D2eButton>
      <D2eButton
        v-focus
        :disabled="busy"
        data-testid="pa-download-csv-download-btn"
        @click="download"
      >
        {{ getText('MRI_PA_BUTTON_DOWNLOAD') }}
      </D2eButton>
    </template>
  </D2eDialog>
</template>

<script lang="ts">
import { mapActions, mapGetters } from 'vuex'
import { D2eButton, D2eDialog } from '@d2e/ui'

export default {
  name: 'download-csv-dialog',
  props: ['closeEv'],
  data() {
    return {
      busy: false,
      cancelled: false,
    }
  },
  computed: {
    ...mapGetters(['getText', 'getCSVDownloadCompleted', 'getIsLargePatientData']),
  },
  watch: {
    getCSVDownloadCompleted(val) {
      if (val) {
        this.$emit('closeEv', { success: !this.cancelled })
      }
    },
  },
  methods: {
    ...mapActions(['setFireDownloadCSV', 'cancelDownloadCSV']),
    download() {
      this.busy = true
      this.cancelled = false
      this.setFireDownloadCSV()
    },
    cancel() {
      if (this.busy) {
        this.cancelled = true
        this.cancelDownloadCSV()
      }
      this.$emit('closeEv', { success: false })
    },
  },
  components: {
    D2eButton,
    D2eDialog,
  },
}
</script>
