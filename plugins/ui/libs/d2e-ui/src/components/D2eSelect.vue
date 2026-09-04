<template>
  <component
    :is="searchable ? VAutocomplete : VSelect"
    class="d2e-select"
    :class="`d2e-select--${size}`"
    :style="{ '--d2e-select-height': `${sizeSpec.height}px` }"
    variant="outlined"
    :model-value="modelValue"
    :items="items"
    item-title="label"
    item-value="value"
    :item-props="itemProps"
    :label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :multiple="multiple"
    :error-messages="errorMessages"
    :hint="hint"
    :density="size === 'sm' ? 'compact' : 'default'"
    :menu-props="{ contentClass: 'd2e-select__menu' }"
    v-bind="forwardAttrs"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-if="prependIcon" #prepend-inner>
      <v-icon :icon="prependIcon" size="24" class="d2e-select__adornment" />
    </template>
  </component>
</template>

<script setup lang="ts">
import { VAutocomplete, VIcon, VSelect } from "vuetify/components";
import { computed, useAttrs } from "vue";
import { SELECT_SIZE_MAP } from "./selectSizes";
import type { D2eSelectItem, D2eSelectSize } from "./selectSizes";

interface Props {
  modelValue?: string | string[] | null;
  items?: D2eSelectItem[];
  label?: string;
  placeholder?: string;
  size?: D2eSelectSize;
  disabled?: boolean;
  multiple?: boolean;
  errorMessages?: string | string[];
  hint?: string;
  /** The leading adornment, e.g. "mdi-account". */
  prependIcon?: string;
  /**
   * Let the user type to narrow the options, as a `VAutocomplete`.
   *
   * Worth turning on wherever the option list is data-driven and can grow —
   * a fixed two-item list is faster to click than to type.
   */
  searchable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  items: () => [],
  label: undefined,
  placeholder: undefined,
  size: "md",
  disabled: false,
  multiple: false,
  errorMessages: undefined,
  hint: undefined,
  prependIcon: undefined,
  searchable: false,
});

defineEmits<{
  "update:modelValue": [value: string | string[] | null];
}>();

const sizeSpec = computed(() => SELECT_SIZE_MAP[props.size]);

// `disabled` on an item is a property of the rendered list row, not of the
// item record, so Vuetify needs it mapped across.
function itemProps(item: D2eSelectItem) {
  return { disabled: item.disabled === true };
}

const attrs = useAttrs();
const forwardAttrs = computed(() => {
  const {
    modelValue: _modelValue,
    items: _items,
    label: _label,
    placeholder: _placeholder,
    size: _size,
    disabled: _disabled,
    multiple: _multiple,
    errorMessages: _errorMessages,
    hint: _hint,
    prependIcon: _prependIcon,
    searchable: _searchable,
    ...rest
  } = attrs as Record<string, unknown>;
  void _modelValue;
  void _items;
  void _label;
  void _placeholder;
  void _size;
  void _disabled;
  void _multiple;
  void _errorMessages;
  void _hint;
  void _prependIcon;
  void _searchable;
  return rest;
});
</script>

<style scoped lang="scss">
// Figma set 69:1398 ("Selection"), variant Outlined. Two Vuetify defaults are
// wrong for this design: the outlined field radius is 4px, and the focused
// border takes the theme `primary` (#000080) where the design uses
// `primary-light`. Both are corrected here.
.d2e-select {
  font-family: var(--d2e-font-family);

  :deep(.v-field) {
    min-height: var(--d2e-select-height);
    border-radius: var(--d2e-radius-md);
    padding-inline: 14px;
    color: var(--d2e-color-neutral-black);
  }

  // Fill the box and let flex centring do the work. With vertical padding the
  // content sits its own height plus 16px from the top, which reads as text
  // riding high in the field rather than centred in it.
  :deep(.v-field__input) {
    align-items: center;
    min-height: var(--d2e-select-height);
    padding-block: 0;
    padding-inline: 0;
    font-size: var(--d2e-font-body1-size);
    font-weight: var(--d2e-font-body1-weight);
    color: var(--d2e-color-neutral-black);
  }

  // An <input> does not inherit font, so the UA's 13.33px Arial applied and
  // the element was 17px tall while its placeholder painted at 16px. The two
  // then disagreed about where the text baseline sits.
  :deep(.v-field__input input) {
    font-family: inherit;
    font-size: var(--d2e-font-body1-size);
    font-weight: var(--d2e-font-body1-weight);
    line-height: normal;
    color: var(--d2e-color-neutral-black);
  }

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

  // Vuetify already draws the notch's top rule on `::before` and its bottom
  // rule on `::after`, both from `--v-field-border-width`, so neither needs
  // restating. An earlier version set BOTH to a top border. Only `::before`
  // gets Vuetify's `opacity: 0` once the label floats, so the reworked
  // `::after` survived and drew a line straight through the floating label.

  :deep(.v-field--focused .v-field__outline) {
    --v-field-border-width: var(--d2e-border-width-md);
    color: var(--d2e-color-primary-light);
  }

  :deep(.v-field--error .v-field__outline),
  :deep(.v-field--focused.v-field--error .v-field__outline) {
    color: var(--d2e-color-alarm);
  }

  // The floating label sits on the border in a white gutter.
  :deep(.v-field-label) {
    font-size: var(--d2e-font-caption1-size);
    font-weight: var(--d2e-font-caption1-weight);
    line-height: 12px;
    letter-spacing: 0.15px;
    color: var(--d2e-color-neutral);
  }

  :deep(.v-field-label--floating) {
    padding-inline: var(--d2e-spacing-xxs);
    background: var(--d2e-color-white);
    // Figma gives the floating label a 12px line-height at a 12px font size,
    // which clips the top of the glyphs once it is rendered. Let the line box
    // grow instead; the label's position is set by Vuetify's transform.
    line-height: 1.2;
    overflow: visible;
  }

  :deep(.v-field--focused .v-field-label) {
    color: var(--d2e-color-primary-light);
  }

  :deep(.v-field--error .v-field-label) {
    color: var(--d2e-color-alarm);
  }

  :deep(.v-field__append-inner .v-icon),
  .d2e-select__adornment {
    font-size: 24px;
    color: var(--d2e-color-neutral);
  }

  :deep(.v-messages) {
    padding-top: 3px;
    font-size: var(--d2e-font-caption1-size);
    font-weight: var(--d2e-font-caption1-weight);
    line-height: 1.66;
    letter-spacing: 0.4px;
    color: var(--d2e-color-neutral);
    opacity: 1;
  }

  &.v-input--error :deep(.v-messages) {
    color: var(--d2e-color-alarm);
  }
}
</style>
