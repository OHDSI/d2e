<template>
  <div class="patientlist-container" ref="patientlistContainer" data-testid="pa-patient-list-table">
    <template v-if="!isLoading">
      <menuButton
        :parentContainer="$refs.patientlistContainer"
        :placeholder="getText('MRI_PA_PATIENT_LIST_EDIT_COLUMNS')"
        :menuData="getColumnSelectionMenu"
        @clickItem="handleColumnMenuAction"
      ></menuButton>
      <div style="height: 14px; flex-shrink: 0"></div>
    </template>
    <template v-if="errorMessage">
      <chartErrorMessage :errorMessage="errorMessage"></chartErrorMessage>
    </template>
    <template v-else>
      <div class="patientlist-control-wrapper" style="flex: 1; min-height: 0; overflow: auto">
        <patientListControl
          :columns="getSelectedAttributes"
          :rows="chartData.data"
          :rowCount="chartData.totalPatientCount"
          :currentPage="currentPage"
          @addColumn="addColumn"
          @removeColumn="removeColumn"
          @toggleInteraction="toggleInteraction"
          @sort="sort"
          @refreshColumnMenu="populateColumnMenu"
          @fireRequest="setFireRequest"
          @goPage="goPage"
          :pageSize="pageSize"
          :showLeftPane="showLeftPane"
        ></patientListControl>
      </div>
      <div>
        <pager
          :currentPage="currentPage"
          :rowCount="chartData.totalPatientCount"
          :pageSize="pageSize"
          @goPage="goPage"
        ></pager>
      </div>
      <div ref="contextPS"></div>
    </template>
  </div>
</template>
<script lang="ts">
declare var sap
import { mapActions, mapGetters } from 'vuex'
import axios from 'axios'
import menuButton from './MenuButton.vue'
import Pager from './Pager.vue'
import patientListControl from './PatientListControl.vue'
import chartErrorMessage from './ChartErrorMessage.vue'
import { postProcessPatientListData } from './helpers/postProcessPatientListData'
import { createZip } from './helpers/createZip'

export default {
  name: 'patientListChart',
  props: ['busyEv', 'showLeftPane'],
  data() {
    return {
      errorMessage: '',
      chartData: {
        data: [],
        totalPatientCount: 0,
      },
      requestId: 0,
      requestCancel: null as (() => void) | null,
      isUnmounted: false,
      isLoading: true,
    }
  },
  watch: {
    'getPLModel.currentPage': function changePage() {
      this.setFireRequest()
    },
    getFireRequest() {
      // Skip if fire requests are being held (during batch updates like applying required filters)
      if (this.isFireRequestHeld) {
        return
      }
      if (Object.keys(this.getSelectedAttributes).length === 0) {
        this.errorMessage = this.getText('MRI_PA_PATIENT_LIT_NO_COLUMNS_SELECTED_MESSAGE')
        this.isLoading = false
        this.$emit('busyEv', false)
        this.$emit('requestError', false)
        return
      }
      this.errorMessage = ''

      this.startRequest(
        ({ cancelToken }) =>
          this.fireQuery({
            url: '/analytics-svc/api/services/patient',
            params: {
              mriquery: JSON.stringify(this.getPLRequest({ useLimit: true })),
              datasetId: this.getSelectedDataset.id,
            },
            cancelToken,
          }),
        rawChartData => {
          const chartData = postProcessPatientListData(rawChartData)
          this.chartData = this.processResult(JSON.parse(JSON.stringify(chartData)))
          this.setCurrentPatientCount({
            currentPatientCount: chartData.totalPatientCount,
          })
          if (typeof chartData.noDataReason !== 'undefined') {
            this.errorMessage = chartData.noDataReason
            this.setCurrentPatientCount({
              currentPatientCount: '--',
            })
          }
        },
        ({ response }) => {
          if (response) {
            let noDataReason = this.getText('MRI_PA_CHART_NO_DATA_DEFAULT_MESSAGE')

            // For all handled errors from backend
            if (response.status === 500) {
              noDataReason = response.data.errorMessage
              if (response.data.errorType === 'MRILoggedError') {
                noDataReason = this.getText('MRI_DB_LOGGED_MESSAGE', response.data.logId)
              }
            }

            this.errorMessage = noDataReason
          }

          this.setCurrentPatientCount({
            currentPatientCount: '--',
          })
        }
      )
    },
    getZipFireDownload() {
      this.downloadZIP({
        ...this.getPLRequestZIP,
      })
        .then(responses => {
          createZip(
            {
              responses,
              cohortName: this.getActiveBookmark?.bookmarkname,
            },
            () => {
              this.completeDownloadZIP()
            }
          )
        })
        .catch(err => {
          // A superseded/cancelled download is not a failure — don't surface an error toast
          if (err?.name === 'AbortError') {
            return
          }
          this.setZIPDownloadError(true)
        })
    },
  },
  computed: {
    ...mapGetters([
      'getZipFireDownload',
      'getText',
      'getFireRequest',
      'isFireRequestHeld',
      'getPLRequest',
      'getPLRequestZIP',
      'getPLModel',
      'getColumnSelectionMenu',
      'getSelectedAttributes',
      'getSelectedDataset',
      'translate',
      'getActiveBookmark',
    ]),
    currentPage() {
      return this.getPLModel.currentPage
    },
    pageSize() {
      return this.getPLModel.pageSize
    },
  },
  beforeUnmount() {
    this.isUnmounted = true
    this.cancelRequest()
    this.$emit('busyEv', false)
    this.$emit('requestError', false)
  },
  mounted() {
    this.populateColumnMenu()
    this.initPLModel({ loadDefault: false })
    this.setPLRequest()
    this.setFireRequest()
  },
  methods: {
    ...mapActions([
      'removeSelectedAttribute',
      'sortAttribute',
      'fireQuery',
      'downloadCSV',
      'downloadZIP',
      'setCurrentPatientCount',
      'setFireRequest',
      'completeDownloadCSV',
      'completeDownloadZIP',
      'setZIPDownloadError',
      'initPLModel',
      'setPLRequest',
      'changePage',
      'populateColumnMenu',
      'addSelectedAttribute',
      'setInteractionSelected',
    ]),
    startRequest(fire, onSuccess, onError) {
      this.requestId += 1
      const requestId = this.requestId

      if (this.requestCancel) {
        this.requestCancel()
        this.requestCancel = null
      }

      const cancelToken = new axios.CancelToken(c => {
        this.requestCancel = () => c('cancel')
      })

      this.isLoading = true
      this.$emit('busyEv', true)
      this.$emit('requestError', false)

      fire({ cancelToken })
        .then(data => {
          if (this.isUnmounted || requestId !== this.requestId) return
          onSuccess(data)
          this.$emit('requestError', false)
        })
        .catch(error => {
          if (this.isUnmounted || requestId !== this.requestId) return
          onError(error)
          this.$emit('requestError', true)
        })
        .finally(() => {
          if (this.isUnmounted || requestId !== this.requestId) return
          this.requestCancel = null
          this.isLoading = false
          this.$emit('busyEv', false)
        })
    },
    cancelRequest() {
      if (this.requestCancel) {
        this.requestCancel()
        this.requestCancel = null
      }
    },
    removeColumn({ configPath }) {
      this.removeSelectedAttribute({ configPath })
      this.setFireRequest()
    },
    sort({ sortOrder, configPath }) {
      this.sortAttribute({
        sortOrder,
        configPath,
      })
      this.setFireRequest()
    },
    goPage(page) {
      this.changePage(page)
    },
    processResult(data) {
      return this.translate(data)
    },
    addColumn(arg) {
      this.addSelectedAttribute({ configPath: arg.path })
      this.populateColumnMenu()
      this.setFireRequest()
    },
    handleColumnMenuAction(arg) {
      if (arg === 'RESET') {
        this.initPLModel({ loadDefault: true })
      } else {
        this.setInteractionSelected({
          configPath: arg.path,
          selected: arg.selected,
        })
      }
      this.setFireRequest()
    },
    toggleInteraction({ path, selected }) {
      this.setInteractionSelected({ configPath: path, selected })
      this.setFireRequest()
    },
  },
  components: {
    chartErrorMessage,
    menuButton,
    patientListControl,
    Pager,
  },
}
</script>
