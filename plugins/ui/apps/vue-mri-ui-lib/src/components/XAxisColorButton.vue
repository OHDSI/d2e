<template>
  <div
    class="axis-menu-button-wrapper x-axis-dropdown-button x-axis-color-button"
    :class="{ 'axis-menu-button-wrapper--disabled': disabled }"
    v-show="axisMenuData.length > 0"
  >
    <div class="iconWrapper">
      <label class="iconLabel">
        <svg
          class="icon cursorDefault"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 -960 960 960"
          width="14"
          height="16"
          fill="currentColor"
        >
          <path
            d="M346-140 100-386q-10-10-15-22t-5-25q0-13 5-25t15-22l230-229-106-106 62-65 400 400q10 10 14.5 22t4.5 25q0 13-4.5 25T686-386L440-140q-10 10-22 15t-25 5q-13 0-25-5t-22-15Zm47-506L179-432h428L393-646Zm399 526q-36 0-61-25.5T706-208q0-27 13.5-51t30.5-47l42-54 44 54q16 23 30 47t14 51q0 37-26 62.5T792-120Z"
          />
        </svg>
      </label>
    </div>
    <div class="buttonWrapper" ref="menuButtonWrapper">
      <button
        class="axisMenuButton"
        ref="menuButton"
        @click="toggleMenu"
        :title="selectionTooltip"
        :disabled="disabled"
        tabindex="0"
      >
        <span class="axisMenuText axisTextPlaceholder" v-if="!selectedAttrText">
          {{ getText('MRI_PA_SELECT_X_AXIS') }}
        </span>
        <span class="axisMenuText" v-if="selectedAttrText">{{ selectedFilterText }}</span>
        <span class="axisMenuSubText" v-if="selectedAttrText">
          {{ selectedAttrText }}
        </span>
        <span class="axisMenuButtonIcon"></span>
      </button>
      <dropDownMenu
        :target="menuButtonEl"
        :parentContainer="parentContainer"
        :subMenu="axisMenuData"
        :opened="menuVisible"
        @clickEv="handleClick"
        @closeEv="closeMenu"
      ></dropDownMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, useTemplateRef } from 'vue'
import { useStore } from 'vuex'
import DropDownMenu from './DropDownMenu.vue'
import {
  buildColorAxisMenuData,
  findAxisMenuItem,
  reconcileColorAxisSelection,
  type ColorAxisMenuItem,
  type ColorAxisSelection,
} from '@/utils/colorAxisSelection'

// Props & Emits
const props = defineProps<{ parentContainer: any; selectedAxis: number | null; disabled?: boolean }>()
const emit = defineEmits<{ colorAxisSelected: [value: number | null] }>()

// Store
const store = useStore()
const getAllAxes = computed(() => store?.getters?.getAllAxes)
const getMriFrontendConfig = computed(() => store?.getters?.getMriFrontendConfig)
const getChartableFilterCards = computed(() => store?.getters?.getChartableFilterCards)
const getText = (key: string) => store?.getters?.getText?.(key) || key

// Template refs
const menuButton = useTemplateRef<HTMLButtonElement>('menuButton')
const menuButtonWrapper = useTemplateRef<HTMLDivElement>('menuButtonWrapper')

// Reactive state
const menuVisible = ref(false)
const menuButtonEl = ref<HTMLButtonElement | null>(null)
const selectedFilterText = ref('')
const selectedAttrText = ref('')
const selectedAxisIndex = ref<number | null>(null)
const selectedFilterCardId = ref<string | null>(null)
const selectedKey = ref<string | null>(null)
const selectionTooltip = computed(() =>
  selectedAttrText.value ? `${selectedFilterText.value} - ${selectedAttrText.value}` : getText('MRI_PA_SELECT_X_AXIS')
)
const axisMenuData = ref<ColorAxisMenuItem[]>([])

// Lifecycle
let isUnmounted = false

onMounted(() => {
  nextTick(() => {
    if (isUnmounted) return
    window.addEventListener('click', closeSubMenu)
    menuButtonEl.value = menuButton.value
  })
})

onBeforeUnmount(() => {
  isUnmounted = true
  window.removeEventListener('click', closeSubMenu)
})

// Watchers
// Immediate: the menu must exist from the first render on, otherwise a selection the store
// already holds (restored bookmark, or this button remounting into a loaded cohort) cannot be
// matched against it and would never reach the label.
watch(
  getAllAxes,
  () => {
    buildMenuData()
    reconcileSelection()
  },
  { deep: true, immediate: true }
)

watch(getMriFrontendConfig, () => {
  buildMenuData()
  reconcileSelection()
})

// Rebuild only: the menu's trailing "None" entry depends on whether something is selected.
// Reconciling here too would re-enter while resetSelection() is still unwinding.
watch(selectedAxisIndex, () => {
  buildMenuData()
})

// Sync internal state when parent changes selectedAxis prop
watch(() => props.selectedAxis, reconcileSelection)

// Methods
// Menu building and reconciliation live in @/utils/colorAxisSelection so they can be unit-tested
// without mounting this component. Everything below only maps their result onto local state.
function buildMenuData() {
  axisMenuData.value = buildColorAxisMenuData({
    allAxes: getAllAxes.value,
    mriFrontendConfig: getMriFrontendConfig.value,
    chartableFilterCards: getChartableFilterCards.value,
    getText,
    hasSelection: selectedAxisIndex.value !== null,
  })
}

function reconcileSelection() {
  const decision = reconcileColorAxisSelection({
    configReady: !!getMriFrontendConfig.value,
    storeAxisIndex: props.selectedAxis,
    allAxes: getAllAxes.value,
    menuData: axisMenuData.value,
    selection: currentSelection(),
  })

  if (decision.action === 'adopt') {
    applySelection(decision.selection)
    return
  }

  if (decision.action === 'clear') {
    resetSelection()
    if (decision.notify) {
      emit('colorAxisSelected', null)
    }
  }
}

function toggleMenu() {
  if (props.disabled) return
  menuVisible.value = !menuVisible.value
}

function closeMenu() {
  menuVisible.value = false
}

function closeSubMenu(event: MouseEvent) {
  if (menuVisible.value && menuButtonWrapper.value && !menuButtonWrapper.value.contains(event.target as Node)) {
    closeMenu()
  }
}

function handleClick(data: any) {
  if (data) {
    if (data.action === 'clear') {
      resetSelection()
      emit('colorAxisSelected', null)
    } else {
      const menuItem = findAxisMenuItem(axisMenuData.value, data.axisIndex)
      if (menuItem) {
        emit('colorAxisSelected', data.axisIndex)
      }
    }
  }
  closeMenu()
}

function currentSelection(): ColorAxisSelection | null {
  if (selectedAxisIndex.value === null) return null
  return {
    axisIndex: selectedAxisIndex.value,
    filterText: selectedFilterText.value,
    attrText: selectedAttrText.value,
    filterCardId: selectedFilterCardId.value,
    key: selectedKey.value,
  }
}

function applySelection(selection: ColorAxisSelection) {
  selectedFilterText.value = selection.filterText
  selectedAttrText.value = selection.attrText
  selectedAxisIndex.value = selection.axisIndex
  selectedFilterCardId.value = selection.filterCardId
  selectedKey.value = selection.key
}

function resetSelection() {
  selectedFilterText.value = ''
  selectedAttrText.value = ''
  selectedAxisIndex.value = null
  selectedFilterCardId.value = null
  selectedKey.value = null
}
</script>

<style scoped></style>
