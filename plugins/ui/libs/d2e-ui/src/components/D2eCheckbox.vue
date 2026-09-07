<template>
  <div
    class="d2e-checkbox"
    :class="[
      `d2e-checkbox--${size}`,
      { 'd2e-checkbox--indeterminate': indeterminate },
    ]"
    :style="sizeStyle"
  >
    <v-checkbox-btn
      :model-value="modelValue"
      :indeterminate="indeterminate"
      :disabled="disabled"
      :label="label"
      color="primary"
      density="compact"
      :aria-label="ariaLabel"
      v-bind="forwardAttrs"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { VCheckboxBtn } from "vuetify/components";
import { computed, useAttrs } from "vue";
import { CHECKBOX_SIZE_MAP } from "./checkboxSizes";
import type { D2eCheckboxSize } from "./checkboxSizes";

interface Props {
  modelValue?: boolean;
  indeterminate?: boolean;
  label?: string;
  disabled?: boolean;
  size?: D2eCheckboxSize;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  indeterminate: false,
  label: undefined,
  disabled: false,
  size: "sm",
  ariaLabel: undefined,
});

defineEmits<{
  "update:modelValue": [value: boolean];
}>();

// `VCheckbox` adds the `v-input` wrapper with message slots and 40px of
// vertical padding. The card header and the bulk toolbar both need a bare
// control, so this wraps `VCheckboxBtn` instead.
const sizeStyle = computed(() => {
  const size = CHECKBOX_SIZE_MAP[props.size];
  return {
    "--d2e-checkbox-box": `${size.box}px`,
    "--d2e-checkbox-padding": `${size.padding}px`,
    "--d2e-checkbox-ripple": `${size.ripple}px`,
  };
});

const attrs = useAttrs();
const forwardAttrs = computed(() => {
  const {
    modelValue: _modelValue,
    indeterminate: _indeterminate,
    label: _label,
    disabled: _disabled,
    size: _size,
    ariaLabel: _ariaLabel,
    ...rest
  } = attrs as Record<string, unknown>;
  void _modelValue;
  void _indeterminate;
  void _label;
  void _disabled;
  void _size;
  void _ariaLabel;
  return rest;
});
</script>

<style scoped lang="scss">
.d2e-checkbox {
  display: inline-flex;
  font-family: var(--d2e-font-family);
  // The hover and focus circles are wider than the box. Without this they are
  // clipped by the card header row.
  overflow: visible;

  :deep(.v-selection-control) {
    min-height: 0;
    overflow: visible;
  }

  // The box itself.
  :deep(.v-selection-control__wrapper) {
    width: var(--d2e-checkbox-box);
    height: var(--d2e-checkbox-box);
    margin: var(--d2e-checkbox-padding);
    overflow: visible;
  }

  // The ring of empty space that carries the hover and focus circles.
  :deep(.v-selection-control__input) {
    width: var(--d2e-checkbox-ripple);
    height: var(--d2e-checkbox-ripple);
    border-radius: 100px;
    overflow: visible;

    &::before {
      inset: 0;
      border-radius: 100px;
      background: transparent;
      opacity: 1;
      transform: none;
    }

    &:hover::before {
      background: color-mix(in srgb, var(--d2e-color-primary) 4%, transparent);
    }

    &:has(input:focus-visible)::before {
      background: color-mix(
        in srgb,
        var(--d2e-color-neutral-black) 12%,
        transparent
      );
    }
  }

  // The glyph. `checkbox-marked` cuts the check out of a filled square, so the
  // white plate behind it is what makes the check read white.
  :deep(.v-selection-control__input > .v-icon) {
    width: var(--d2e-checkbox-box);
    height: var(--d2e-checkbox-box);
    font-size: var(--d2e-checkbox-box);
    border-radius: 2px;
    background: var(--d2e-color-white);
    color: var(--d2e-color-neutral-light);
    opacity: 1;
  }

  // Checked and indeterminate both paint in primary.
  :deep(.v-selection-control--dirty .v-selection-control__input > .v-icon) {
    color: var(--d2e-color-primary);
  }

  &--indeterminate :deep(.v-selection-control__input > .v-icon) {
    color: var(--d2e-color-primary);
  }

  :deep(.v-selection-control--dirty .v-selection-control__input),
  &--indeterminate :deep(.v-selection-control__input) {
    &:has(input:focus-visible)::before {
      background: color-mix(in srgb, var(--d2e-color-primary) 30%, transparent);
    }
  }

  // Disabled paints the border and the checked fill in the same neutral.
  :deep(.v-selection-control--disabled .v-selection-control__input > .v-icon) {
    color: var(--d2e-color-neutral-light);
    opacity: 1;
  }

  :deep(.v-label) {
    font-family: var(--d2e-font-family);
    color: var(--d2e-color-neutral-black);
    opacity: 1;
  }

  :deep(.v-selection-control--disabled .v-label) {
    color: var(--d2e-color-neutral-light);
  }
}
</style>
