<template>
  <v-btn
    class="d2e-button"
    :variant="resolvedVariant.variant"
    :color="resolvedVariant.color"
    :size="resolvedSize"
    :loading="loading"
    :disabled="disabled"
    :block="block"
    :prepend-icon="prependIcon"
    :append-icon="appendIcon"
    :ripple="false"
  >
    <template v-if="$slots.prepend" #prepend>
      <slot name="prepend" />
    </template>
    <slot />
  </v-btn>
</template>

<script setup lang="ts">
import { VARIANT_MAP, SIZE_MAP } from "./buttonVariants";
import type { D2eButtonVariant, D2eButtonSize } from "./buttonVariants";
import { VBtn } from "vuetify/components";
import { computed } from "vue";

interface Props {
  variant?: D2eButtonVariant;
  size?: D2eButtonSize;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  // Figma `Sub category` = Icon front / Icon back. Do not use v-btn's `icon`
  // prop here: it makes the button icon-only and drops the label. For an
  // icon-only control use D2eIconButton.
  prependIcon?: string;
  appendIcon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "primary",
  size: "md",
  loading: false,
  disabled: false,
  block: false,
  prependIcon: undefined,
  appendIcon: undefined,
});

const resolvedVariant = computed(() => VARIANT_MAP[props.variant]);
const resolvedSize = computed(() => SIZE_MAP[props.size]);
</script>

<style scoped lang="scss">
.d2e-button {
  height: 40px;
  border-radius: var(--d2e-radius-md);
  font-size: var(--d2e-font-button-size);
  font-weight: var(--d2e-font-button-weight);
  line-height: var(--d2e-font-button-line-height);
  letter-spacing: var(--d2e-font-button-letter-spacing);
  text-transform: none;
}
</style>
