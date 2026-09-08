<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="540"
    rounded="0"
    persistent
    attach="#app"
    role="alertdialog"
    aria-labelledby="unsaved-changes-title"
    aria-describedby="unsaved-changes-body"
  >
    <v-card
      class="unsaved-dialog"
      data-testid="unsaved-changes-dialog"
    >
      <div class="unsaved-dialog__title">
        <span id="unsaved-changes-title" class="unsaved-dialog__title-text">{{ title }}</span>
        <v-btn
          icon="mdi-close"
          color="#000080"
          size="small"
          class="unsaved-dialog__close-btn"
          variant="text"
          :aria-label="closeLabel"
          data-testid="close-dialog-button"
          @click="$emit('stay')"
        />
      </div>

      <div id="unsaved-changes-body" class="unsaved-dialog__body">
        <p>{{ message }}</p>
      </div>

      <div class="unsaved-dialog__actions">
        <v-btn
          class="unsaved-dialog__btn unsaved-dialog__btn--leave"
          variant="outlined"
          color="#000080"
          data-testid="leave-page-button"
          @click="$emit('leave')"
        >
          {{ leaveLabel }}
        </v-btn>
        <v-btn
          ref="stayButtonRef"
          class="unsaved-dialog__btn unsaved-dialog__btn--stay"
          variant="elevated"
          color="#000080"
          autofocus
          data-testid="stay-page-button"
          @click="$emit('stay')"
        >
          {{ stayLabel }}
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useStore } from 'vuex'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

defineEmits<{
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
</script>

<style scoped lang="scss">
.unsaved-dialog {
  width: 100%;
  max-width: 540px;
  overflow: hidden !important;
  // Vuetify's `.v-dialog > .v-overlay__content > .v-card` rule (border-radius: 4px,
  // overflow-y: auto, specificity 0-3-0) must not win over this scoped class;
  // 16px matches the React UnsavedChangesDialog in apps/portal.
  border-radius: 16px !important;
  box-shadow:
    0 6px 30px 5px rgba(0, 0, 0, 0.12),
    0 16px 24px 2px rgba(0, 0, 0, 0.14),
    0 8px 10px -5px rgba(0, 0, 0, 0.2);

  &__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 24px 12px;
  }

  &__title-text {
    font-weight: 500;
    font-size: 18px;
    line-height: 1.2;
    letter-spacing: 0;
    color: var(--d2e-color-primary, #000080);
  }

  &__body {
    padding: 16px 24px 24px;

    p {
      margin: 0;
      font-size: 16px;
      line-height: 1.5;
      color: var(--color-neutral-dark, #000000);
    }
  }

  &__actions {
    display: flex;
    gap: 16px;
    padding: 16px 24px;
    border-top: 1px solid var(--color-neutral-lighter, #dedcda);
  }

  &__btn {
    flex: 1 1 0;
    height: 40px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  &__btn--leave {
    color: var(--d2e-color-primary, #000080);
    border: 1px solid var(--color-neutral-lighter, #cccfe5);
  }

  &__btn--stay {
    color: var(--color-neutral-extra-lightest, #faf8f8);
    background-color: var(--d2e-color-primary, #000080);
    box-shadow:
      0 1px 5px 0 rgba(0, 0, 0, 0.12),
      0 2px 2px 0 rgba(0, 0, 0, 0.14),
      0 3px 1px -2px rgba(0, 0, 0, 0.2);
  }

  &__close-btn {
    border-radius: 50% !important;
  }
}
</style>
