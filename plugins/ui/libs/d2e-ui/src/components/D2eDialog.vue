<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="resolvedMaxWidth"
    persistent
    no-click-animation
    :attach="attach"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="title ? titleId : undefined"
    v-bind="forwardAttrs"
    @update:model-value="onModelValueUpdate"
  >
    <v-card
      class="d2e-dialog"
      :data-testid="dataTestId"
      tabindex="-1"
      @keydown.esc="onEscape"
    >
      <header class="d2e-dialog__header">
        <h2 v-if="title" :id="titleId" class="d2e-dialog__title">
          {{ title }}
        </h2>
        <v-btn
          v-if="showClose"
          class="d2e-dialog__close"
          icon="mdi-close"
          variant="text"
          size="small"
          :ripple="false"
          :aria-label="closeLabel"
          :disabled="busy"
          data-testid="d2e-dialog-close"
          @click="closeFromButton"
        />
      </header>

      <v-divider />

      <div class="d2e-dialog__body">
        <slot />
        <div v-if="busy" class="d2e-dialog__busy">
          <v-progress-circular
            indeterminate
            color="primary"
            aria-label="Loading"
          />
        </div>
      </div>

      <template v-if="$slots.actions">
        <v-divider />
        <div class="d2e-dialog__actions">
          <slot name="actions" />
        </div>
      </template>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {
  VBtn,
  VCard,
  VDialog,
  VDivider,
  VProgressCircular,
} from "vuetify/components";
import { computed, nextTick, ref, useAttrs, watch } from "vue";
import { DIALOG_SIZE_MAP, type D2eDialogSize } from "./dialogSizes";

interface Props {
  modelValue: boolean;
  title?: string;
  /** Design size. Figma variables Modal/S 540, Modal/L 900, Modal/XL 1200. */
  size?: D2eDialogSize;
  /** Escape hatch. Overrides `size` when set. */
  maxWidth?: number | string;
  /**
   * MODAL CLOSE BEHAVIOR (Figma 2106:162) says Escape closes informational
   * modals, but raises a confirm-discard step for long forms and multi-step
   * flows. Set false there and handle the confirmation in the parent.
   */
  closeOnEscape?: boolean;
  showClose?: boolean;
  closeLabel?: string;
  busy?: boolean;
  attach?: string | boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  size: "s",
  maxWidth: undefined,
  closeOnEscape: true,
  showClose: true,
  closeLabel: "Close dialog",
  busy: false,
  attach: "#app",
});

const resolvedMaxWidth = computed(
  () => props.maxWidth ?? DIALOG_SIZE_MAP[props.size],
);

const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  close: [];
}>();

defineOptions({ inheritAttrs: false });

const titleId = `d2e-dialog-title-${Math.random().toString(36).slice(2, 10)}`;

const attrs = useAttrs();

// data-testid belongs on the card (the visible dialog surface); everything
// else (transition, scrollable, aria-* and friends) is forwarded to v-dialog.
const dataTestId = computed(
  () => (attrs["data-testid"] as string | undefined) ?? undefined,
);

const forwardAttrs = computed(() => {
  const { "data-testid": _testId, ...rest } = attrs as Record<string, unknown>;
  void _testId;
  return rest;
});

const previouslyFocused = ref<HTMLElement | null>(null);

watch(
  () => props.modelValue,
  (open, prev) => {
    if (open && !prev) {
      const active = (
        typeof document !== "undefined" ? document.activeElement : null
      ) as HTMLElement | null;
      previouslyFocused.value =
        active && typeof active.focus === "function" ? active : null;
      return;
    }
    if (!open && prev) {
      const target = previouslyFocused.value;
      previouslyFocused.value = null;
      if (target && typeof target.focus === "function") {
        nextTick(() => {
          try {
            target.focus();
          } catch {
            void 0;
          }
        });
      }
    }
  },
  { immediate: true },
);

function onModelValueUpdate(open: boolean) {
  // A busy dialog must not close through any path.
  if (props.busy && !open) return;
  emit("update:modelValue", open);
  if (!open) emit("close");
}

// The overlay never dismisses a modal — MODAL CLOSE BEHAVIOR (Figma 2106:162)
// says "Don't dismiss modal, no action" for every modal type. `v-dialog` is
// therefore always persistent, and Escape is handled here instead.
function onEscape() {
  if (props.busy || !props.closeOnEscape) return;
  emit("update:modelValue", false);
  emit("close");
}

function closeFromButton() {
  if (props.busy) return;
  emit("update:modelValue", false);
  emit("close");
}
</script>

<style scoped lang="scss">
.d2e-dialog {
  position: relative;
  width: 100%;
  overflow: hidden !important;
  border-radius: 16px !important;
  background: var(--d2e-color-white);
  box-shadow: var(--d2e-elevation-e16);
  font-family: var(--d2e-font-family);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 24px 24px 12px;
  }

  &__title {
    margin: 0;
    font-size: var(--d2e-font-heading5-size);
    font-weight: var(--d2e-font-heading5-weight);
    line-height: var(--d2e-font-heading5-line-height);
    letter-spacing: var(--d2e-font-heading5-letter-spacing);
    color: var(--d2e-color-primary);
  }

  &__close {
    flex: none;
    color: var(--d2e-color-primary);
    border-radius: 50% !important;
  }

  &__body {
    position: relative;
    padding: 16px 24px 24px;
    font-size: var(--d2e-font-body1-size);
    line-height: var(--d2e-font-body1-line-height);
    color: var(--d2e-color-neutral-black);

    // A <p> in the body carries its own bottom margin, which stacks on this
    // padding and doubles the space above the divider. Collapse the last
    // child's margin rather than dropping the padding, so bodies that end in
    // a field (which has no margin) keep their 24px. The busy overlay is
    // excluded: it is the last child whenever `busy` is true, and would
    // otherwise hand the margin back mid-operation.
    > :last-child:not(.d2e-dialog__busy) {
      margin-bottom: 0;
    }
  }

  &__actions {
    display: flex;
    gap: 16px;
    padding: 16px 24px;

    :deep(.v-btn) {
      flex: 1 1 0;
      min-width: 0;
    }
  }

  &__busy {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(255 255 255 / 70%);
  }
}
</style>
