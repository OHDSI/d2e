<template>
  <v-menu
    v-model="isOpen"
    class="d2e-date-field__menu"
    :close-on-content-click="false"
  >
    <template #activator="{ props: activatorProps }">
      <v-text-field
        class="d2e-date-field"
        variant="outlined"
        density="compact"
        readonly
        hide-details
        prepend-inner-icon="mdi-calendar-today"
        :model-value="modelValue"
        :placeholder="label"
        :disabled="disabled"
        :clearable="clearable"
        :aria-label="ariaLabel"
        @click:clear="onClear"
        v-bind="mergeProps(activatorProps, forwardAttrs)"
        @keydown.enter.prevent.stop="onActivatorEnter"
      />
    </template>

    <v-date-picker
      hide-header
      :model-value="fromIsoDate(modelValue)"
      :min="fromIsoDate(min)"
      :max="fromIsoDate(max)"
      @update:model-value="onPick"
    />
  </v-menu>
</template>

<script setup lang="ts">
import { VDatePicker, VMenu, VTextField } from "vuetify/components";
import { computed, mergeProps, ref, useAttrs } from "vue";
import { fromIsoDate, toIsoDate } from "./dateFieldFormat";

// The root is a `VMenu`, which does not stop inheritance either, so a
// fallthrough attr travels on to `VOverlay` and is merged onto the teleported
// `.v-overlay` div rather than the field: `width` would size the popup, and a
// `data-testid` would exist on two nodes once the picker has opened.
// `forwardAttrs` below puts every attr on the field instead.
defineOptions({ inheritAttrs: false });

interface Props {
  modelValue?: string | null;
  label?: string;
  disabled?: boolean;
  min?: string | null;
  max?: string | null;
  ariaLabel?: string;
  /**
   * Show a clear affordance once a date is picked.
   *
   * Off by default, because the Figma field has none. Turn it on wherever the
   * field is one bound of a range: `VDatePickerMonth` in single mode always
   * assigns the clicked day and never deselects, so without this a picked
   * date cannot be dropped short of resetting the whole form.
   */
  clearable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  label: undefined,
  disabled: false,
  min: null,
  max: null,
  ariaLabel: undefined,
  clearable: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const attrs = useAttrs();
const forwardAttrs = computed(() => {
  const {
    modelValue: _modelValue,
    label: _label,
    disabled: _disabled,
    min: _min,
    max: _max,
    ariaLabel: _ariaLabel,
    clearable: _clearable,
    ...rest
  } = attrs as Record<string, unknown>;
  void _modelValue;
  void _label;
  void _disabled;
  void _min;
  void _max;
  void _ariaLabel;
  void _clearable;
  return rest;
});

const internalOpen = ref(false);
const isOpen = computed({
  get: () => internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = props.disabled ? false : value;
  },
});

/** The clear icon sits on the activator, so swallow the click that would
    otherwise reopen the picker the moment the value is dropped. */
function onClear(event: Event) {
  event.stopPropagation();
  emit("update:modelValue", null);
  internalOpen.value = false;
}

/**
 * Open the picker on Enter, and keep the key to ourselves.
 *
 * Two separate problems, both from the enclosing menu. A `VMenu` with
 * `close-on-content-click: false` treats Enter on its content as "move to the
 * next focusable child, and close if there is none" (`VMenu.js` onKeydown), so
 * Enter on the last field in a filter panel closed the whole panel. It also
 * calls `preventDefault()`, and `VMenu`'s activator handler only knows
 * ArrowDown and ArrowUp, so Enter on this readonly input did nothing at all.
 * `.stop` keeps the enclosing menu from seeing the key; opening here gives the
 * field the keyboard behaviour a date input should have had anyway.
 */
function onActivatorEnter() {
  if (props.disabled) return;
  internalOpen.value = true;
}

function onPick(date: unknown) {
  emit("update:modelValue", toIsoDate(date instanceof Date ? date : null));
  internalOpen.value = false;
}
</script>

<style scoped lang="scss">
// Same problem as D2eSelect (Figma node 2697:211995): the outlined field's
// default radius is 4px and the focused border takes the theme `primary`
// where the design uses `primary-light`. Corrected here the same way.
.d2e-date-field {
  --d2e-date-field-height: 40px;

  font-family: var(--d2e-font-family);

  :deep(.v-field) {
    min-height: var(--d2e-date-field-height);
    border-radius: var(--d2e-radius-md);
    padding-inline: 14px;
    color: var(--d2e-color-neutral-black);
  }

  // A text field's own <input> IS `.v-field__input`. With vertical padding it
  // takes its intrinsic 34px and sits flush against the field's top edge,
  // leaving 6px below and reading as text riding high. Give it the full box
  // instead; a browser centres an input's text in its content height.
  :deep(.v-field__input) {
    min-height: var(--d2e-date-field-height);
    height: var(--d2e-date-field-height);
    padding-block: 0;
    padding-inline: 0;
    font-size: var(--d2e-font-body1-size);
    font-weight: var(--d2e-font-body1-weight);
    color: var(--d2e-color-neutral-black);
  }

  // A text field's input IS `.v-field__input`, unlike a select's, where the
  // input is a child of it. Both forms are needed or the placeholder falls
  // back to the UA's black.
  :deep(.v-field__input::placeholder),
  :deep(.v-field__input input::placeholder) {
    font-size: var(--d2e-font-body1-size);
    font-weight: var(--d2e-font-body1-weight);
    line-height: 24px;
    letter-spacing: 0.15px;
    color: var(--d2e-color-neutral-light);
    opacity: 1;
  }

  // Enabled and disabled share the same 1px neutral-light border.
  :deep(.v-field__outline) {
    --v-field-border-width: var(--d2e-border-width-sm);
    --v-field-border-opacity: 1;
    color: var(--d2e-color-neutral-light);
  }

  // Vuetify's own notch rules already read `--v-field-border-width`. Setting
  // both `::before` and `::after` to a top border draws a line through a
  // floating label, because only `::before` fades out when the label floats.
  // This field has no floating label, but the rule is a landmine either way.

  :deep(.v-field--focused .v-field__outline) {
    --v-field-border-width: var(--d2e-border-width-md);
    color: var(--d2e-color-primary-light);
  }

  :deep(.v-field__prepend-inner .v-icon) {
    font-size: 24px;
    margin-inline-end: var(--d2e-spacing-xs);
    color: var(--d2e-color-neutral-light);
  }
}
</style>
