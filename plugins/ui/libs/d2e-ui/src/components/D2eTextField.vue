<template>
  <v-text-field
    :model-value="modelValue"
    variant="outlined"
    :label="label"
    :required="required"
    :error-messages="errorMessages"
    :maxlength="maxlength"
    :placeholder="placeholder"
    :autofocus="autofocus"
    :hide-details="hideDetails"
    v-bind="forwardAttrs"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { VTextField } from "vuetify/components";
import { computed, useAttrs } from "vue";

interface Props {
  modelValue?: string;
  label?: string;
  required?: boolean;
  errorMessages?: string | string[];
  maxlength?: number | string;
  placeholder?: string;
  autofocus?: boolean;
  /**
   * Vuetify reserves 22px under every field for validation messages, which
   * shows as a permanent gap. `"auto"` reserves it only when a message is
   * present, which is what the Figma frames show.
   */
  hideDetails?: boolean | "auto";
}

withDefaults(defineProps<Props>(), {
  modelValue: "",
  label: undefined,
  required: false,
  errorMessages: undefined,
  maxlength: undefined,
  placeholder: undefined,
  autofocus: false,
  hideDetails: "auto",
});

defineEmits<{
  "update:modelValue": [value: string];
}>();

const attrs = useAttrs();
const forwardAttrs = computed(() => {
  const {
    modelValue: _modelValue,
    label: _label,
    required: _required,
    errorMessages: _errorMessages,
    maxlength: _maxlength,
    placeholder: _placeholder,
    autofocus: _autofocus,
    hideDetails: _hideDetails,
    ...rest
  } = attrs as Record<string, unknown>;
  void _modelValue;
  void _label;
  void _required;
  void _errorMessages;
  void _maxlength;
  void _placeholder;
  void _autofocus;
  void _hideDetails;
  return rest;
});
</script>
