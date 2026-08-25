<template>
  <D2eDialog
    :model-value="modelValue"
    :title="title"
    :close-label="closeLabel"
    max-width="540"
    persistent
    data-testid="unsaved-changes-dialog"
    @update:model-value="onModelValueUpdate"
  >
    <p>{{ message }}</p>
    <template #actions>
      <D2eButton variant="secondary" data-testid="leave-page-button" @click="$emit('leave')">
        {{ leaveLabel }}
      </D2eButton>
      <D2eButton ref="stayButtonRef" autofocus data-testid="stay-page-button" @click="$emit('stay')">
        {{ stayLabel }}
      </D2eButton>
    </template>
  </D2eDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { D2eButton, D2eDialog } from '@d2e/ui'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  leave: []
  stay: []
}>()

const store = useStore()
const stayButtonRef = ref<{ $el?: HTMLElement } | null>(null)

const getText = (key: string): string => {
  const resolver = store?.getters?.getText
  if (typeof resolver === 'function') {
    const value = resolver(key)
    return typeof value === 'string' ? value : key
  }
  return key
}

const title = computed(() => getText('MRI_PA_BOOKMARK_UNSAVED_DIALOG_TITLE'))
const message = computed(() => getText('MRI_PA_BOOKMARK_UNSAVED_DIALOG_TEXT'))
const stayLabel = computed(() => getText('MRI_PA_BUTTON_STAY_ON_PAGE'))
const leaveLabel = computed(() => getText('MRI_PA_BUTTON_LEAVE_WITHOUT_SAVING'))
const closeLabel = computed(() => getText('MRI_PA_CLOSE'))

watch(
  () => props.modelValue,
  async opened => {
    if (!opened) return
    await nextTick()
    const el = stayButtonRef.value?.$el ?? null
    if (el && typeof (el as HTMLElement).focus === 'function') {
      ;(el as HTMLElement).focus()
    }
  },
  { immediate: true }
)

function onModelValueUpdate() {
  // The unsaved-changes dialog is persistent: any close attempt means the user
  // stays on the page.
  emit('stay')
}
</script>
