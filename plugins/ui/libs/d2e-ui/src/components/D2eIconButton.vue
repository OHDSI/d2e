<template>
  <v-btn
    class="d2e-icon-button"
    :class="[`d2e-icon-button--${category}`, `d2e-icon-button--${size}`]"
    :style="containerStyle"
    icon
    variant="text"
    :ripple="false"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <!-- Default slot carries an exported SVG when the design's glyph is not in
         the MDI set; otherwise the `icon` prop names an MDI glyph. -->
    <slot :size="iconSize">
      <v-icon :icon="icon" :size="iconSize" />
    </slot>
  </v-btn>
</template>

<script setup lang="ts">
import { ICON_BUTTON_SIZE_MAP } from "./iconButtonSizes";
import type {
  D2eIconButtonSize,
  D2eIconButtonCategory,
} from "./iconButtonSizes";
import { VBtn, VIcon } from "vuetify/components";
import { computed } from "vue";

interface Props {
  category?: D2eIconButtonCategory;
  size?: D2eIconButtonSize;
  icon?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  category: "no-stroke",
  size: "md",
  icon: undefined,
  ariaLabel: undefined,
  disabled: false,
});

defineEmits<{ click: [event: MouseEvent] }>();

const iconSize = computed(() => ICON_BUTTON_SIZE_MAP[props.size].icon);

const containerStyle = computed(() => ({
  width: `${ICON_BUTTON_SIZE_MAP[props.size].container}px`,
  height: `${ICON_BUTTON_SIZE_MAP[props.size].container}px`,
}));
</script>

<style scoped lang="scss">
.d2e-icon-button {
  flex: none;
  padding: 0;
  font-family: var(--d2e-font-family);
  color: var(--d2e-color-primary);
  background: transparent;
  // v-btn defaults to the `elevated` variant, which paints a surface and a
  // shadow. The design's icon buttons have neither.
  box-shadow: none;
  border: 1px solid transparent;
  border-radius: 8px;
  text-transform: none;

  &--no-stroke {
    border-color: transparent;

    &:hover {
      background: var(--d2e-color-primary-xtra-lightest);
    }

    &:active {
      background: var(--d2e-color-primary-lightest);
    }
  }

  &--no-stroke#{&}--lg,
  &--no-stroke#{&}--md {
    border-radius: 100px;
  }

  &--secondary {
    border-color: var(--d2e-color-primary-lighter);

    &:hover {
      background: var(--d2e-color-primary-xtra-lightest);
    }

    &:active {
      background: var(--d2e-color-primary-lightest);
    }
  }

  &--primary {
    color: var(--d2e-color-white);
    background: var(--d2e-color-primary);

    &:hover {
      background: var(--d2e-color-primary-light);
    }

    &:active {
      background: var(--d2e-color-primary);
    }
  }

  // Figma 2006:843: only the primary category fills on disabled. Secondary
  // keeps its outline over a transparent surface, and no-stroke stays bare.
  &:disabled {
    color: var(--d2e-color-neutral-light);
    background: transparent;
    opacity: 1;
  }

  &--primary:disabled {
    background: var(--d2e-color-neutral-lighter);
  }
}
</style>
