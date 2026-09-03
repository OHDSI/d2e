<template>
  <!--
    With an `activator` slot the list becomes an anchored popover. With no
    activator the wrapper is a pass-through and the list renders inline,
    exactly as it did before the popover was added, so no existing consumer
    can regress.
  -->
  <component :is="wrapper" v-bind="wrapperProps">
    <template v-if="$slots.activator" #activator="{ props: activatorProps }">
      <slot name="activator" v-bind="activatorProps" />
    </template>

    <div
      class="d2e-menu"
      role="menu"
      :style="{ width: resolvedWidth }"
      @keydown="onKeydown"
    >
      <button
        v-for="(item, index) in items"
        :key="item.value"
        :ref="(el) => setItemRef(el, index)"
        type="button"
        class="d2e-menu__item"
        :class="{
          'd2e-menu__item--selected': item.selected,
          'd2e-menu__item--disabled': item.disabled,
          'd2e-menu__item--danger': item.danger,
        }"
        role="menuitem"
        :disabled="item.disabled"
        @click="onSelect(item)"
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
  </component>
</template>

<script setup lang="ts">
import { VIcon, VMenu } from "vuetify/components";
import {
  computed,
  defineComponent,
  nextTick,
  ref,
  useSlots,
  watch,
  type ComponentPublicInstance,
} from "vue";
import {
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex,
} from "./menuNavigation";

export interface D2eMenuItem {
  label: string;
  value: string;
  icon?: string;
  selected?: boolean;
  disabled?: boolean;
  /** Destructive action: the label and icon paint in the alarm colour. */
  danger?: boolean;
}

interface Props {
  items: D2eMenuItem[];
  /** Open state. Leave it unbound to let the menu own its open state. */
  modelValue?: boolean;
  /** Panel width. A number becomes px. A string passes through. */
  width?: number | string;
  /** Vuetify location string for the popover anchor. */
  location?: string;
  /** Close the popover after a select. */
  closeOnSelect?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  width: 330,
  location: "bottom end",
  closeOnSelect: true,
});

const emit = defineEmits<{
  select: [value: string];
  "update:modelValue": [value: boolean];
}>();

const slots = useSlots();

/** Renders its children with no wrapper element, for the no-activator path. */
const PassThrough = defineComponent({
  name: "D2eMenuPassThrough",
  inheritAttrs: false,
  setup(_, { slots: passThroughSlots }) {
    return () => passThroughSlots.default?.();
  },
});

const resolvedWidth = computed(() =>
  typeof props.width === "number" ? `${props.width}px` : props.width,
);

// When `modelValue` is not bound, the menu keeps its own open state. An
// activator then works without the caller wiring `v-model`.
const internalOpen = ref(false);
const isOpen = computed(() =>
  props.modelValue === undefined ? internalOpen.value : props.modelValue,
);

function setOpen(value: boolean) {
  internalOpen.value = value;
  emit("update:modelValue", value);
}

const wrapper = computed(() => (slots.activator ? VMenu : PassThrough));

const wrapperProps = computed(() =>
  slots.activator
    ? {
        modelValue: isOpen.value,
        location: props.location,
        closeOnContentClick: false,
        "onUpdate:modelValue": setOpen,
      }
    : {},
);

const itemEls = ref<(HTMLButtonElement | null)[]>([]);

function setItemRef(
  el: Element | ComponentPublicInstance | null,
  index: number,
) {
  itemEls.value[index] = (el as HTMLButtonElement | null) ?? null;
}

function focusIndex(index: number) {
  if (index < 0) return;
  itemEls.value[index]?.focus();
}

/** Index of the focused item, or -1 when focus is elsewhere. */
function focusedIndex(): number {
  const active =
    typeof document === "undefined" ? null : document.activeElement;
  if (!active) return -1;
  return itemEls.value.findIndex((el) => el !== null && el === active);
}

function onKeydown(event: KeyboardEvent) {
  const from = focusedIndex();

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusIndex(nextEnabledIndex(props.items, from, 1));
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusIndex(
      nextEnabledIndex(props.items, from < 0 ? props.items.length : from, -1),
    );
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    focusIndex(firstEnabledIndex(props.items));
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    focusIndex(lastEnabledIndex(props.items));
  }
}

// VMenu returns focus to the activator on close, so only the open side needs
// work here. The extra tick lets the popover content mount first.
watch(isOpen, async (open) => {
  if (!open) return;
  await nextTick();
  await nextTick();
  focusIndex(firstEnabledIndex(props.items));
});

function onSelect(item: D2eMenuItem) {
  if (item.disabled) return;
  emit("select", item.value);
  if (props.closeOnSelect) setOpen(false);
}
</script>

<style scoped lang="scss">
// Values from design-system/menu-dropdown.md: container 330 (showcase width),
// radius 8, padding 16/12, elevation/8; rows 40 px, Body 1/Subtitle 1.
// The width comes from the `width` prop as an inline style.
.d2e-menu {
  display: flex;
  flex-direction: column;
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
    height: 44px;
    padding: 12px 24px 12px 16px;
    color: var(--d2e-color-primary);
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

    // Delete reads in the alarm colour (Figma 1801:215950).
    &--danger:not(.d2e-menu__item--disabled) {
      color: var(--d2e-color-alarm);
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
