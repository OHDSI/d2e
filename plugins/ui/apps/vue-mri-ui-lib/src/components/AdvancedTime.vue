<template>
  <div class="form-group advancedtime-filter">
    <bs-card>
      <template v-slot:header>
        <div class="d-flex">
          <div class="mr-auto">
            <button
              class="btn btn-link btn-sm"
              @click="showCollapse = !showCollapse"
              :class="showCollapse ? 'collapsed' : 'null'"
              :aria-controls="id"
              :aria-expanded="showCollapse ? 'true' : 'false'"
            >
              <appIcon icon="slimArrowDown" v-if="showCollapse"></appIcon>
              <appIcon icon="slimArrowRight" v-if="!showCollapse"></appIcon>
            </button>
            <span>{{ getTargetInteractionText }}</span>
          </div>
          <button class="btn btn-link btn-sm" @click="addTimeFilter">
            <appIcon icon="add"></appIcon>
          </button>
          <br />
        </div>
      </template>
      <bs-collapse :id="id" role="tabpanel" v-model="showCollapse">
        <template v-for="(item, index) in model.props.timeFilterModel.timeFilters" :key="index">
          <div class="row">
            <div class="col">
              <div class="app-single-select">
                <multiselect
                  v-model="item.originSelection"
                  :placeholder="getText('MRI_PA_FILTERCARD_SELECTION_NONE')"
                  :searchable="false"
                  :options="originSelectionOptions"
                  :allow-empty="false"
                  track-by="key"
                  label="text"
                  @update:modelValue="e => updateOriginSelection(e, index)"
                  selectLabel
                  selectedLabel
                  deselectLabel
                />
              </div>
            </div>
          </div>
          <div
            class="row"
            v-if="item.originSelection.key !== 'overlap'"
            @mouseenter="onInputHover(index)"
            @mouseleave="isHelpVisible[getHelpId(index)] = false"
          >
            <div class="col d-flex">
              <div class="flex-grow-1">
                <input class="form-control input-days" v-model="item.days" @change="e => updateDays(e, index)" />
              </div>
              <div class="box h-100 d-flex justify-content-center flex-column" style="margin-left: 10px; width: 50px">
                <app-label :text="getText('MRI_PA_TEMPORAL_FILTER_DAYS')"></app-label>
              </div>
              <div class="box h-100 d-flex justify-content-center flex-column" style="width: 30px">
                <helpPopover :isHelpVisible="isHelpVisible[getHelpId(index)]" helpType="num"></helpPopover>
              </div>
            </div>
          </div>

          <div class="row" v-if="item.originSelection.key !== 'overlap'">
            <div class="col d-flex">
              <div class="flex-grow-1">
                <div class="app-single-select">
                  <multiselect
                    v-model="item.targetSelection"
                    :placeholder="getText('MRI_PA_FILTERCARD_SELECTION_NONE')"
                    :searchable="false"
                    :options="targetSelectionOptions"
                    :allow-empty="false"
                    track-by="key"
                    label="text"
                    @update:modelValue="e => updateTargetSelection(e, index)"
                    selectLabel
                    selectedLabel
                    deselectLabel
                  />
                </div>
              </div>
              <div class="box h-100 d-flex justify-content-center flex-column" style="margin-left: 10px; width: 30px">
                <app-label :text="getText('MRI_PA_TEMPORAL_FILTER_OF')"></app-label>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="col">
              <div class="app-single-select">
                <multiselect
                  v-model="item.targetInteraction"
                  :placeholder="getText('MRI_PA_FILTERCARD_SELECTION_NONE')"
                  :searchable="false"
                  :options="getList"
                  :allow-empty="false"
                  @update:modelValue="e => updateTargetInteraction(e, index)"
                  track-by="key"
                  label="text"
                  selectLabel
                  selectedLabel
                  deselectLabel
                />
              </div>
            </div>
          </div>
          <div class="row">
            <div class="col">
              <bs-button
                v-if="model.props.timeFilterModel.timeFilters.length > 1"
                size="sm"
                variant="secondary"
                @click="deleteTimeFilter(index)"
                style="margin-bottom: 10px"
                >{{ getText('MRI_PA_BUTTON_DELETE') }}</bs-button
              >
            </div>
          </div>
        </template>
      </bs-collapse>
    </bs-card>
  </div>
</template>
<script lang="ts">
import appIcon from '../lib/ui/app-icon.vue'
import bsButton from '../lib/ui/bs-button.vue'
import bsCard from '../lib/ui/bs-card.vue'
import bsCollapse from '../lib/ui/bs-collapse.vue'
import appLabel from '../lib/ui/app-label.vue'
import helpPopover from './HelpPopover.vue'
import { mapActions, mapGetters, mapMutations } from 'vuex'
import { ADVANCEDTIME_SET_TIMEFILTER_TITLE } from '../store/mutation-types'
import AdvancedTimeFilterModel from '../lib/models/AdvancedTimeFilterModel'

export default {
  name: 'advancedtime',
  props: ['advancedTimeLayout', 'parentId', 'filterCardId', 'filterCardName'],
  data() {
    return {
      model: JSON.parse(JSON.stringify(this.advancedTimeLayout)),
      isHelpVisible: {},
      id: null,
      showCollapse: true,
    }
  },
  mounted() {
    this.id = this.model.props.filterCardId + '.advance.time'
    if (this.model.props.timeFilterModel.timeFilters.length === 0) {
      this.addTimeFilter()
    } else {
      // recreate this.model[key, text] object with this.advancedTimeLayout[key]
      this.model.props.timeFilterModel.timeFilters = this.model.props.timeFilterModel.timeFilters.map(tf => {
        const originSelection = {
          key: tf.originSelection,
          text: this.originSelectionOptions.find(o => o.key === tf.originSelection).text,
        }
        const targetSelection = {
          key: tf.targetSelection,
          text: this.targetSelectionOptions.find(t => t.key === tf.targetSelection).text,
        }
        // getList items are { key, text } (see getFilterCardsByBoolFilterContainerId's
        // allowedSuccessors) — reading `ti.targetInteraction` here left the key
        // undefined, so the getList watcher below then reset the dropdown to
        // "None" on the next card add/remove while the store kept the relation.
        const ti = this.getList.find(t => t.key === tf.targetInteraction)
        const targetInteraction = {
          key: ti ? ti.key : '',
          text: ti ? ti.text : '',
        }
        return {
          originSelection,
          targetSelection,
          targetInteraction,
          days: tf.days,
        }
      })
    }
  },
  computed: {
    ...mapGetters(['getFilterCardsByBoolFilterContainerId', 'getText', 'getBoolFilterContainers']),
    originSelectionOptions() {
      return [
        { key: 'startdate', text: this.getText('MRI_PA_TEMPORAL_FILTER_START') },
        { key: 'enddate', text: this.getText('MRI_PA_TEMPORAL_FILTER_END') },
        { key: 'overlap', text: this.getText('MRI_PA_TEMPORAL_FILTER_OVERLAP') },
      ]
    },
    targetSelectionOptions() {
      return [
        {
          key: 'before_startdate',
          text: this.getText('MRI_PA_TEMPORAL_FILTER_BEFORE_START'),
        },
        {
          key: 'after_startdate',
          text: this.getText('MRI_PA_TEMPORAL_FILTER_AFTER_START'),
        },
        {
          key: 'before_enddate',
          text: this.getText('MRI_PA_TEMPORAL_FILTER_BEFORE_END'),
        },
        {
          key: 'after_enddate',
          text: this.getText('MRI_PA_TEMPORAL_FILTER_AFTER_END'),
        },
      ]
    },
    getList() {
      // all containers other than the current one
      const boolFilterContainers = Object.keys(this.getBoolFilterContainers()).filter(
        containerId => containerId !== this.parentId
      )
      let optionsList = []
      boolFilterContainers.forEach(containerId => {
        const filtercards = this.getFilterCardsByBoolFilterContainerId({
          boolFilterContainerId: containerId,
          dataSource: 'allowedSuccessors',
        })
        // add filtercards with no OR operation (ie., boolfiltercontainer which has only one filtercard)
        if (filtercards.length === 1) {
          optionsList = optionsList.concat(...filtercards)
        }
      })
      return [
        {
          key: '',
          text: this.getText('MRI_PA_FILTERCARD_SELECTION_NONE'),
        },
        ...optionsList,
      ]
    },
    getTargetInteractionText() {
      const lookup = this.getMap()
      lookup.delete('')

      const timeFilterTitle = `${this.filterCardName} - ${this.advancedTimeLayout.props.timeFilterModel.timeFilters
        .map(item => lookup.get(item.targetInteraction))
        .join(', ')}`

      return timeFilterTitle
    },
  },
  watch: {
    getList() {
      const lookup = this.getMap()
      this.advancedTimeLayout.props.timeFilterModel.timeFilters.forEach(timeFilter => {
        timeFilter.targetInteraction = lookup.has(timeFilter.targetInteraction) ? timeFilter.targetInteraction : ''
      })
      // reset targetInteractions when the filtercards are modified (added or deleted)
      this.model.props.timeFilterModel.timeFilters.forEach(timeFilter => {
        timeFilter.targetInteraction = lookup.has(timeFilter.targetInteraction.key) ? timeFilter.targetInteraction : ''
      })
    },
  },
  methods: {
    ...mapActions(['updateFilterCardTimeFilter']),
    ...mapMutations([ADVANCEDTIME_SET_TIMEFILTER_TITLE]),
    getHelpId(index) {
      return `visible${index}`
    },
    onInputHover(index) {
      const id = this.getHelpId(index)
      this.isHelpVisible = { ...this.isHelpVisible, [id]: true }
    },
    updateTargetInteraction(e, index) {
      this.advancedTimeLayout.props.timeFilterModel.timeFilters[index].targetInteraction = e.key
      this.updateFilterCardTimeFilter({
        filterCardId: this.filterCardId,
        timeFilters: this.advancedTimeLayout.props.timeFilterModel.timeFilters,
      })
    },
    updateOriginSelection(e, index) {
      this.advancedTimeLayout.props.timeFilterModel.timeFilters[index].originSelection = e.key
      this.updateFilterCardTimeFilter({
        filterCardId: this.filterCardId,
        timeFilters: this.advancedTimeLayout.props.timeFilterModel.timeFilters,
      })
    },
    updateTargetSelection(e, index) {
      this.advancedTimeLayout.props.timeFilterModel.timeFilters[index].targetSelection = e.key
      this.updateFilterCardTimeFilter({
        filterCardId: this.filterCardId,
        timeFilters: this.advancedTimeLayout.props.timeFilterModel.timeFilters,
      })
    },
    updateDays(e, index) {
      const value = e.target.value.trim()
      const days = value && AdvancedTimeFilterModel.validateText(value) ? value : String(parseFloat(value) || 0)
      this.advancedTimeLayout.props.timeFilterModel.timeFilters[index].days = days
      this.model.props.timeFilterModel.timeFilters[index].days = days
      this.updateFilterCardTimeFilter({
        filterCardId: this.filterCardId,
        timeFilters: this.advancedTimeLayout.props.timeFilterModel.timeFilters,
      })
    },
    addTimeFilter() {
      const newTimeFilter = {
        originSelection: {
          key: 'startdate',
          text: this.getText('MRI_PA_TEMPORAL_FILTER_START'),
        },
        targetSelection: {
          key: 'before_startdate',
          text: this.getText('MRI_PA_TEMPORAL_FILTER_BEFORE_START'),
        },
        targetInteraction: {
          key: '',
          text: this.getText('MRI_PA_FILTERCARD_SELECTION_NONE'),
        },
        days: '0',
      }
      this.model.props.timeFilterModel.timeFilters.push(newTimeFilter)
      this.advancedTimeLayout.props.timeFilterModel.timeFilters.push({
        originSelection: 'startdate',
        targetSelection: 'before_startdate',
        targetInteraction: '',
        days: '0',
      })
      // persist the default TimeFilter in the state
      this.updateFilterCardTimeFilter({
        filterCardId: this.filterCardId,
        timeFilters: this.advancedTimeLayout.props.timeFilterModel.timeFilters,
      })
    },
    deleteTimeFilter(index) {
      const filterToDelete = this.model.props.timeFilterModel.timeFilters.splice(index, 1)
      this.advancedTimeLayout.props.timeFilterModel.timeFilters.splice(index, 1)
      this.updateFilterCardTimeFilter({
        filterCardId: this.filterCardId,
        timeFilters: this.advancedTimeLayout.props.timeFilterModel.timeFilters,
      })
    },
    getFilteredList() {
      let optionsList = []
      const allBoolFilterContainers = this.getBoolFilterContainers()
      const boolFilterContainers = Object.keys(allBoolFilterContainers)
        .filter(
          // filtering FilterContainers that have more than one filtercard
          // the advancetime does not allow any FilterCard with OR condition
          cId => allBoolFilterContainers[cId].props.filterCards.length === 1
        )
        .filter(
          // filtering the current FilterCard
          containerId => containerId !== this.parentId
        )
      boolFilterContainers.forEach(containerId => {
        optionsList = optionsList.concat(
          this.getFilterCardsByBoolFilterContainerId({
            boolFilterContainerId: containerId,
            dataSource: 'allowedSuccessors',
          }).filter(item => item.key !== this.advancedTimeLayout.props.filterCardId)
        )
      })
      return optionsList
    },
    getMap() {
      return new Map(this.getFilteredList().map(i => [i.key, i.text]))
    },
  },
  components: {
    helpPopover,
    appIcon,
    bsButton,
    bsCard,
    bsCollapse,
    appLabel,
  },
}
</script>
