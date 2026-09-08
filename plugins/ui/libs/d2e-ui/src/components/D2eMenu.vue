<template>
  <div class="d2e-menu" role="menu" @keydown="onKeydown">
    <button
      v-for="(item, index) in items"
      :key="item.value"
      ref="itemRefs"
      type="button"
      class="d2e-menu__item"
      :class="{
        'd2e-menu__item--selected': item.selected,
        'd2e-menu__item--disabled': item.disabled,
      }"
      role="menuitem"
      :tabindex="index === activeIndex ? 0 : -1"
      :disabled="item.disabled"
      @click="onSelect(item)"
      @focus="activeIndex = index"
    >
      <v-icon
        v-if="item.icon"
        :icon="item.icon"
        size="20"
        class="d2e-menu__item-icon"
      />
      <span class="d2e-menu__item-label">{{ item.label }}</span>
      <v-icon
        v-if="item.selected"
        icon="mdi-check"
        size="20"
        class="d2e-menu__item-check"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { VIcon } from "vuetify/components";
import { computed, ref } from "vue";
export interface D2eMenuItem {
  label: string;
  value: string;
  icon?: string;
  selected?: boolean;
  disabled?: boolean;
}

interface Props {
  items: D2eMenuItem[];
}

const props = defineProps<Props>();

const emit = defineEmits<{ select: [value: string] }>();

const itemRefs = ref<HTMLButtonElement[]>([]);

// Roving tabindex (WAI-ARIA menu pattern): only one item sits in the Tab
// order at a time; Arrow Up/Down/Home/End move it. Falls back to the first
// enabled item so a menu with no selection is still keyboard-reachable.
const firstEnabledIndex = computed(() =>
  props.items.findIndex((item) => !item.disabled),
);
const selectedIndex = computed(() =>
  props.items.findIndex((item) => item.selected && !item.disabled),
);
const activeIndex = ref(
  selectedIndex.value >= 0 ? selectedIndex.value : firstEnabledIndex.value,
);

function enabledIndexes(): number[] {
  return props.items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);
}

function focusIndex(index: number) {
  if (index < 0) return;
  activeIndex.value = index;
  itemRefs.value[index]?.focus();
}

function onKeydown(event: KeyboardEvent) {
  const enabled = enabledIndexes();
  if (!enabled.length) return;
  const current = enabled.indexOf(activeIndex.value);

  switch (event.key) {
    case "ArrowDown": {
      event.preventDefault();
      const next = enabled[(current + 1 + enabled.length) % enabled.length];
      focusIndex(next);
      break;
    }
    case "ArrowUp": {
      event.preventDefault();
      const prev = enabled[(current - 1 + enabled.length) % enabled.length];
      focusIndex(prev);
      break;
    }
    case "Home":
      event.preventDefault();
      focusIndex(enabled[0]);
      break;
    case "End":
      event.preventDefault();
      focusIndex(enabled[enabled.length - 1]);
      break;
  }
}

function onSelect(item: D2eMenuItem) {
  if (item.disabled) return;
  emit("select", item.value);
}
</script>

<style scoped lang="scss">
// Values from design-system/menu-dropdown.md: container 330 (showcase width),
// radius 8, padding 16/12, elevation/8; rows 40 px, Body 1/Subtitle 1.
.d2e-menu {
  display: flex;
  flex-direction: column;
  width: 330px;
  padding: 12px 16px;
  background: var(--d2e-color-white);
  border-radius: 8px;
  box-shadow: var(--d2e-elevation-e8);
  font-family: var(--d2e-font-family);

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 40px;
    padding: 0 8px;
    color: var(--d2e-color-neutral-black);
    background: transparent;
    border: 0;
    border-radius: 4px;
    font-size: var(--d2e-font-body1-size);
    font-weight: var(--d2e-font-body1-weight);
    line-height: var(--d2e-font-body1-line-height);
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--d2e-color-primary-xtra-lightest);
    }

    &--selected {
      font-weight: var(--d2e-font-subtitle1-weight);
      color: var(--d2e-color-primary);
      background: var(--d2e-color-neutral-xtra-lightest);
    }

    &--disabled {
      color: var(--d2e-color-neutral-light);
      cursor: not-allowed;
    }
  }

  &__item-icon {
    color: var(--d2e-color-neutral-light);
  }

  &__item-check {
    margin-left: auto;
    color: var(--d2e-color-primary);
  }

  &__item-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
