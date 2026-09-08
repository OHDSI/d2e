<template>
  <div
    v-bind:class="['FilterCard', cssClass, this.isNew && !this.isBasic ? 'MriPaFilterCardNew' : '']"
    @click="onFiltercardClick"
    :data-testid="testId"
  >
    <!--Filtercard rename messageBox-->
    <messageBox messageType="custom" @close="cancel" :busy="busy" v-if="renameModal.show">
      <template v-slot:header>{{ getText('MRI_PA_FILTERCARD_RENAME_DIALOG_TITLE') }}</template>
      <template v-slot:body>
        <div>
          <div>{{ getText('MRI_PA_FILTERCARD_RENAME_DIALOG_TEXT') }}</div>
          <input class="form-control" type="text" v-model="renameModal.text" />
        </div>
      </template>
      <template v-slot:footer>
        <div class="flex-spacer"></div>
        <appButton
          :click="openRenameDialog"
          :text="getText('MRI_PA_FILTERCARD_RENAME_DIALOG_CANCEL_BUTTON')"
          v-focus
        ></appButton>
        <appButton :click="onRenameSubmit" :text="getText('MRI_PA_FILTERCARD_RENAME_DIALOG_BUTTON')"></appButton>
      </template>
    </messageBox>
    <bs-card v-bind:class="getClasses()">
      <template v-slot:header>
        <div class="d-flex" role="tab">
          <button
            v-if="!isBasic && showBooleanCondition"
            class="btn btn-sm btn-boolean-toggle"
            @click="toggleBooleanCondition"
          >
            {{ getText(boolConditionText) }}
            <appIcon icon="synchronize"></appIcon>
          </button>
          <div class="mr-auto card-header-left">
            <button
              class="btn btn-link btn-sm btn-collapse"
              @click="showCollapse = !showCollapse"
              :class="showCollapse ? 'collapsed' : null"
              :aria-controls="id"
              :aria-expanded="showCollapse ? 'true' : 'false'"
            >
              <appIcon icon="slimArrowDown" v-if="showCollapse"></appIcon>
              <appIcon icon="slimArrowRight" v-if="!showCollapse"></appIcon>
            </button>
            <label>{{ name }}</label>
            <bs-badge v-if="displayShowCohortEntryExit" variant="light" class="ml-2 filter-card-badge">{{
              entryExitLabel
            }}</bs-badge>
            <span v-show="isDisabled" class="card-help-button" @click="openHelp">
              <appIcon icon="information"></appIcon>
            </span>
          </div>
          <div>
            <!-- filter card context menu -->
            <bs-dropdown
              ref="contextMenuDropdown"
              variant="link"
              size="sm"
              class="btn-filtercard-menu"
              no-caret
              align="right"
              trigger-testid="filter-card-menu-trigger"
              @show="onDropdownShow"
            >
              <template v-slot:button-content>
                <appIcon
                  icon="menu"
                  :title="getText('MRI_PA_TOOLTIP_FILTERCARD_MOREMENU_BUTTON')"
                  style="margin-right: 16px"
                ></appIcon>
              </template>
              <!-- operations -->
              <div class="dropdown-scroll" :style="dropdownScrollStyle">
                <template v-for="item in moreButtonMenuOperations" :key="item">
                  <bs-dropdown-item @click="onMoreMenuItemSelected(item)">{{ item.text }}</bs-dropdown-item>
                </template>

                <bs-dropdown-divider></bs-dropdown-divider>
                <!-- attributes -->
                <bs-checkbox-group stacked v-model="checkedAttributes" :text-field="text">
                  <template v-for="item in moreButtonMenuAttributes" :key="item">
                    <div class="bs-dropdown-item bg-white text-body" :style="dropdownItemStyle">
                      <bs-checkbox :value="item.value">{{ item.text }}</bs-checkbox>
                    </div>
                  </template>
                </bs-checkbox-group>

                <bs-dropdown-divider v-if="moreButtonMenuTimeOperations.length > 0"></bs-dropdown-divider>
                <!-- time -->
                <template v-for="item in moreButtonMenuTimeOperations" :key="item">
                  <bs-dropdown-item class="bs-dropdown-item bg-white text-body">
                    <bs-checkbox
                      :checked="isChecked(item)"
                      :menu-item="item"
                      @menu-item-click="onMoreMenuItemSelected"
                      >{{ item.text }}</bs-checkbox
                    >
                  </bs-dropdown-item>
                </template>

                <bs-dropdown-divider v-if="moreButtonMenuExcludeOperation.length > 0"></bs-dropdown-divider>
                <!-- exclude -->
                <template v-for="item in moreButtonMenuExcludeOperation" :key="item">
                  <bs-dropdown-item @click="onMoreMenuItemSelected(item)">
                    <bs-checkbox
                      :checked="isChecked(item)"
                      :menu-item="item"
                      @menu-item-click="onMoreMenuItemSelected"
                      >{{ item.text }}</bs-checkbox
                    >
                  </bs-dropdown-item>
                </template>
              </div>
            </bs-dropdown>
          </div>
        </div>
      </template>
      <bs-collapse :id="id" role="tabpanel" v-model="showCollapse" class="body-collapse">
        <div class="row">
          <div class="col">
            <!-- attributes -->
            <template v-for="item in constraints" :key="item">
              <constraint
                :id="item"
                :parent-name="name"
                v-on:enable-filtercard="enableFilterCard"
                v-on:disable-filtercard="disableFilterCard"
              ></constraint>
            </template>
          </div>
        </div>
        <div class="row">
          <div class="col">
            <!-- advance time -->
            <advancedtime
              v-if="displayAdvanceTime && !isExcluded"
              :advancedTimeLayout="filterCardModel.props.layout.advancedTimeLayout"
              :filterCardId="id"
              :parentId="parentId"
              :filterCardName="name"
            ></advancedtime>
          </div>
        </div>
        <dialogBox
          v-if="showHelpPopover"
          :position="helpPosition"
          :dialogWidth="'380px'"
          @close="showHelpPopover = false"
        >
          <template v-slot:header>{{ dialogContent.header }}</template>
          <template v-slot:body>
            <div class="helpDialogBox">
              <span>{{ dialogContent.text }}</span>
            </div>
          </template>
        </dialogBox>
      </bs-collapse>
    </bs-card>
  </div>
</template>
<script lang="ts">
import { mapActions, mapGetters, mapMutations } from 'vuex'
import { FILTERCARD_REMOVE_NEW_STATE } from '../store/mutation-types'
import appButton from '../lib/ui/app-button.vue'
import appLabel from '../lib/ui/app-label.vue'
import appIcon from '../lib/ui/app-icon.vue'
import bsBadge from '../lib/ui/bs-badge.vue'
import bsCard from '../lib/ui/bs-card.vue'
import bsCollapse from '../lib/ui/bs-collapse.vue'
import bsCheckbox from '../lib/ui/bs-checkbox.vue'
import bsCheckboxGroup from '../lib/ui/bs-checkbox-group.vue'
import bsDropdown from '../lib/ui/bs-dropdown.vue'
import bsDropdownItem from '../lib/ui/bs-dropdown-item.vue'
import bsDropdownDivider from '../lib/ui/bs-dropdown-divider.vue'
import messageBox from './MessageBox.vue'
import constraint from './Constraint.vue'
import advancedtime from './AdvancedTime.vue'
import dialogBox from './DialogBox.vue'

const operationsMenu = ['rename', 'close', 'clear']

interface IMenuItemType {
  text: string
  tooltip?: string
  key: string
  constraintId?: string
  icon?: string
}

const defaultProps = {
  displayAdvanceTime: false,
  renameModal: {
    text: '',
    show: false,
  },
  isDisabled: false,
  showHelpPopover: false,
  helpPosition: {
    left: '',
    bottom: '',
  },
  dialogContent: {
    header: '',
    text: '',
  },
}

export default {
  name: 'filtercard',
  props: ['id', 'parentId', 'cssClass', 'showBooleanCondition'],
  data() {
    return {
      ...JSON.parse(JSON.stringify(defaultProps)),
      showCollapse: true,
      dropdownScrollStyle: {},
      dropdownItemStyle: {},
    }
  },
  mounted() {
    this.displayAdvanceTime =
      this.filterCardModel.props.hasOwnProperty('layout') &&
      this.filterCardModel.props.layout.hasOwnProperty('advancedTimeLayout') &&
      this.filterCardModel.props.layout.advancedTimeLayout.props.timeFilterModel.timeFilters.length > 0
  },
  watch: {
    getHasAssignedConfig(oldValue, newValue) {
      if (newValue !== oldValue) {
        this.displayAdvanceTime = false
      }
    },
    getSplitterWidth: {
      handler(width) {
        this.updateDropdownStyles(width)
      },
      immediate: true,
    },
    'renameModal.show': {
      immediate: true,
      handler(value) {
        this.$emit('renameModalShown', value)
      },
    },
    totalFilterCardCount: {
      handler(newCount) {
        if (this.displayAdvanceTime && newCount <= 1) {
          this.displayAdvanceTime = false
          this.clearFilterCardTimeFilter({ filterCardId: this.id })
        }
      },
    },
  },
  computed: {
    ...mapGetters([
      'getText',
      'getFilterCard',
      'getFilterCardConstraints',
      'getMriFrontendConfig',
      'getHasAssignedConfig',
      'getNewCardStates',
      'getSplitterWidth',
      'getFilterCardCount',
    ]),
    isNew() {
      return this.getNewCardStates[this.id]
    },
    boolConditionText() {
      let text
      switch (this.filterCardModel.props.op) {
        case 'AND':
          text = 'MRI_PA_AND'
          break
        case 'OR':
          text = 'MRI_PA_OR'
          break
      }
      return text
    },
    checkedAttributes: {
      get() {
        return this.filterCardModel.props.constraints
      },
      set(newList: string[]) {
        if (newList.length === this.checkedAttributes.length) {
          return
        }
        // an attribute  was removed
        if (newList.length < this.checkedAttributes.length) {
          const constraintId = this.checkedAttributes.filter(i => newList.indexOf(i) < 0)[0]
          this.deleteFilterCardConstraint({
            constraintId,
            filterCardId: this.id,
          })
        } else {
          // an attribute was checked
          const key = newList.filter(i => this.checkedAttributes.indexOf(i) < 0)[0]
          this.addFilterCardConstraint({ key, filterCardId: this.id })
        }
      },
    },
    isExcluded() {
      return this.filterCardModel.props.excludeFilter
    },
    isBasic() {
      return this.filterCardModel.props.key === 'patient'
    },
    moreButtonMenuOperations() {
      const menu: IMenuItemType[] = [
        {
          text: this.getText('MRI_PA_FILTERCARD_CLEAR_CONSTRAINTS_BTN_LABEL'),
          icon: 'app-icon://eraser',
          tooltip: this.getText('MRI_PA_TOOLTIP_FILTERCARD_CLEAR_CONSTRAINTS_BUTTON'),
          key: 'clear',
        },
        {
          text: this.getText('MRI_PA_FILTERCARD_RENAME'),
          tooltip: this.getText('MRI_PA_FILTERCARD_RENAME'),
          icon: 'app-icon://edit',
          key: 'rename',
        },
      ]

      if (this.filterCardModel.props.key !== 'patient') {
        menu.unshift({
          text: this.getText('MRI_PA_FILTERCARD_CLOSE_BTN_LABEL'),
          icon: 'app-icon://decline',
          tooltip: this.getText('MRI_PA_TOOLTIP_FILTERCARD_CLOSE_BUTTON'),
          key: 'close',
        })
      }
      return menu
    },
    moreButtonMenuTimeOperations() {
      const menu: IMenuItemType[] = []

      if (this.filterCardModel.props.allowParentConstraint) {
        const parentInteractionConfig =
          this.filterCardModel.props.filterCardConfig.oInternalConfigFilterCard.parentInteraction
        if (
          parentInteractionConfig &&
          parentInteractionConfig.possibleParent &&
          parentInteractionConfig.possibleParent.length > 0
        ) {
          const key = 'parentInteraction'
          const constraintId = this.constraints.find(c => c.split('.').pop() === key)
          menu.push({
            key,
            constraintId,
            text: parentInteractionConfig.parentLabel || this.getText('MRI_PA_FILTERCARD_CONSTRAINT_PARENT'),
          })
        }
      }

      // item for Advanced Time Filter
      // Advance Time filter is not supported if filter is in exclusion tab
      // And requires at least 2 filter cards (source and target)
      const totalFilterCards = this.getFilterCardCount({
        excludeBasicCard: true,
        excludedOnly: false,
        matchType: 'matchall',
      })
      if (!this.isExcluded && !this.isBasic && totalFilterCards > 1) {
        menu.push({
          text: this.getText('MRI_PA_TEMPORAL_FILTER_ADVANCED_TIME_FILTER'),
          key: 'advancedTime',
        })
      }

      return menu
    },
    moreButtonMenuExcludeOperation() {
      const menu: IMenuItemType[] = []
      if (this.filterCardModel.props.allowExcludeOption) {
        // item for exclusion filter
        menu.push({
          text: this.getText('MRI_PA_MENUITEM_EXCLUDE'),
          key: 'exclude',
        })
      }
      return menu
    },
    moreButtonMenuAttributes(): IMenuItemType[] {
      if (!this.filterCardModel.props.filterCardConfig) {
        return []
      }
      return this.filterCardModel.props.filterCardConfig.getFilterAttributes().map(oneConfigAttr => {
        const key = oneConfigAttr.getConfigKey()
        const constraintId = this.constraints.find(
          c => oneConfigAttr.getConfigPath() === this.getMriFrontendConfig.getGenericPath(c)
        )
        return {
          value: constraintId || key,
          key,
          constraintId,
          text: oneConfigAttr.getName(),
        }
      })
    },
    filterCardModel() {
      try {
        return this.getFilterCard(this.id)
      } catch (err) {
        return {
          props: {},
        }
      }
    },
    name() {
      return !this.filterCardModel.props.name && this.filterCardModel.props.key === 'patient'
        ? this.getText('MRI_PA_FILTERCARD_TITLE_BASIC_DATA')
        : this.filterCardModel.props.name
    },
    entryExitLabel() {
      return this.filterCardModel.props.isEntry
        ? this.getText('MRI_PA_CHART_ENTRY')
        : this.filterCardModel.props.isExit
          ? this.getText('MRI_PA_CHART_EXIT')
          : ''
    },
    constraints() {
      return this.filterCardModel.props.constraints
    },
    displayShowCohortEntryExit() {
      return this.getMriFrontendConfig._internalConfig.panelOptions.cohortEntryExit
    },
    testId() {
      return `pa-filter-card-${this.id.replace(/\./g, '-')}`
    },
    totalFilterCardCount() {
      return this.getFilterCardCount({
        excludeBasicCard: true,
        excludedOnly: false,
        matchType: 'matchall',
      })
    },
  },
  methods: {
    ...mapMutations([FILTERCARD_REMOVE_NEW_STATE]),
    ...mapActions([
      'changeFilterCardName',
      'deleteFilterCard',
      'addFilterCardConstraint',
      'deleteFilterCardConstraint',
      'toggleExcludeFilterCard',
      'clearFilterCardTimeFilter',
      'clearAllConstraintsOfFilterCard',
      'toggleFilterBooleanCondition',
    ]),
    onFiltercardClick() {
      this[FILTERCARD_REMOVE_NEW_STATE](this.id)
    },
    isChecked({ key, icon }) {
      switch (key) {
        case 'exclude':
          return this.filterCardModel.props.excludeFilter
        case 'advancedTime':
          return this.displayAdvanceTime
        case 'parentInteraction':
          return this.constraints.find(c => c.split('.').pop() === key) !== undefined
        default:
          return icon === 'checked'
      }
    },
    onRenameSubmit() {
      this.changeFilterCardName({
        filterCardId: this.id,
        name: this.renameModal.text,
      })
      this.renameModal.show = false
    },
    openRenameDialog() {
      if (!this.renameModal.show) {
        this.renameModal.text = this.name
        this.renameModal.show = true
      } else {
        this.renameModal.text = ''
        this.renameModal.show = false
      }
    },
    onMoreMenuItemSelected({ key, constraintId }) {
      // if there already is a constraint for this attribute, we remove it otherwise we add it
      if (key === 'exclude') {
        this.toggleExcludeFilterCard({ filterCardId: this.id })
      } else if (key === 'advancedTime') {
        this.displayAdvanceTime = !this.displayAdvanceTime
        if (!this.displayAdvanceTime) {
          this.clearFilterCardTimeFilter({ filterCardId: this.id })
        }
      } else if (key === 'close') {
        this.deleteFilterCard({
          filterCardId: this.id,
        })
      } else if (key === 'clear') {
        this.clearAllConstraintsOfFilterCard({ filterCardId: this.id })
        if (this.displayAdvanceTime) {
          this.displayAdvanceTime = false
          this.clearFilterCardTimeFilter({ filterCardId: this.id })
        }
      } else if (key === 'rename') {
        this.openRenameDialog()
      } else if (this.getFilterCardConstraints(this.id).findIndex(fcconst => fcconst.props.attrKey === key) > -1) {
        this.deleteFilterCardConstraint({
          constraintId,
          filterCardId: this.id,
        })
      } else {
        this.addFilterCardConstraint({ key, filterCardId: this.id })
      }
    },
    enableFilterCard() {
      this.isDisabled = false
    },
    disableFilterCard() {
      this.isDisabled = true
    },
    getClasses() {
      return [this.isDisabled ? 'MriPaFilterCardDisabled' : '']
    },
    toggleBooleanCondition() {
      // TOGGLE Boolean Condition
      const filterCardOperator = this.filterCardModel.props.op
      this.toggleFilterBooleanCondition({
        filterCardId: this.id,
        operator: filterCardOperator,
        parentId: this.parentId,
      })
    },
    openHelp() {
      this.showHelpPopover = true
      this.helpPosition.bottom = `${window.innerHeight - this.$el.children[0].getBoundingClientRect().top}px`
      this.helpPosition.left = `${this.$el.children[0].getBoundingClientRect().left}px`

      this.dialogContent = {
        header: this.getText('MRI_PA_DISABLED_FC_HELP_HEADER'),
        text: this.getText('MRI_PA_DISABLED_FC_HELP_TEXT'),
      }
    },
    updateDropdownStyles(width) {
      const maxHeight = this.calculateDropdownMaxHeight()

      this.dropdownScrollStyle = {
        width: `${width - 25}px`,
        maxWidth: '400px',
        maxHeight: `${maxHeight}px`,
      }
      this.dropdownItemStyle = {
        width: `${width - 25}px`,
        whiteSpace: 'normal',
      }
    },
    calculateDropdownMaxHeight() {
      if (!this.$el) {
        return 400 // fallback
      }

      // Find the hamburger button (dropdown trigger) instead of using the whole card
      const dropdownButton = this.$el.querySelector('.btn-filtercard-menu .bs-dropdown__trigger')
      if (!dropdownButton) {
        return 400 // fallback if button not found
      }

      // Find the filters container instead of using viewport
      const filtersContainer = this.$el.closest('.filters-content')
      if (!filtersContainer) {
        return 400 // fallback if container not found
      }

      const buttonRect = dropdownButton.getBoundingClientRect()
      const containerRect = filtersContainer.getBoundingClientRect()
      const padding = 20 // Some padding

      // Replicate bs-dropdown's checkFlipNeeded logic
      const dropdownRef = this.$refs.contextMenuDropdown?.$el
      if (!dropdownRef) {
        return 400 // fallback if dropdown ref not found
      }

      const triggerRect = dropdownRef.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - triggerRect.bottom
      const spaceAbove = triggerRect.top
      const estimatedDropdownHeight = 300
      const willFlipUp = spaceBelow < estimatedDropdownHeight && spaceAbove > estimatedDropdownHeight

      const availableHeight = willFlipUp
        ? buttonRect.top - containerRect.top - padding
        : containerRect.bottom - buttonRect.bottom - padding

      // Ensure minimum height and don't exceed reasonable maximum
      return Math.max(150, Math.min(availableHeight, 500))
    },
    onDropdownShow() {
      this.updateDropdownStyles(this.getSplitterWidth)
    },
  },
  components: {
    messageBox,
    appButton,
    appLabel,
    appIcon,
    bsBadge,
    bsCard,
    bsCollapse,
    bsCheckbox,
    bsCheckboxGroup,
    bsDropdown,
    bsDropdownItem,
    bsDropdownDivider,
    constraint,
    advancedtime,
    dialogBox,
  },
}
</script>

<style scoped>
.filter-card-badge {
  color: var(--d2e-color-primary, #000080) !important;
}
</style>
