<template>
  <span class="d2e-status-chip" :style="resolved">
    <v-icon v-if="icon" :icon="icon" size="16" />
    <span class="d2e-status-chip__label">
      <slot>{{ label }}</slot>
    </span>
  </span>
</template>

<script setup lang="ts">
import { STATUS_CHIP_VARIANT_MAP } from "./statusChipVariants";
import type { D2eStatusChipVariant } from "./statusChipVariants";
import { VIcon } from "vuetify/components";
import { computed } from "vue";

interface Props {
  variant?: D2eStatusChipVariant;
  label?: string;
  icon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "positive",
  label: undefined,
  icon: undefined,
});

const resolved = computed(() => STATUS_CHIP_VARIANT_MAP[props.variant]);
</script>

<style scoped lang="scss">
.d2e-status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--d2e-spacing-xxs);
  height: 25px;
  padding: var(--d2e-spacing-xxs) var(--d2e-spacing-xs);
  border-radius: 100px;
  font-family: var(--d2e-font-family);
  font-size: var(--d2e-font-caption1-size);
  font-weight: var(--d2e-font-caption1-weight);
  line-height: var(--d2e-font-caption1-line-height);
  letter-spacing: var(--d2e-font-caption1-letter-spacing);
  white-space: nowrap;

  &__label {
    line-height: 1;
  }
}
</style>
