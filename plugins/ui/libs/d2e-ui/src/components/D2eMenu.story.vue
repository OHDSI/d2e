<script setup lang="ts">
import { ref } from "vue";
import D2eMenu from "./D2eMenu.vue";
import D2eIconButton from "./D2eIconButton.vue";
import type { D2eMenuItem } from "./D2eMenu.vue";

const selected = ref("");

const items: D2eMenuItem[] = [
  { label: "Rename", value: "rename", icon: "mdi-pencil" },
  { label: "Duplicate", value: "duplicate", icon: "mdi-content-copy" },
  { label: "Materialize", value: "materialize", icon: "mdi-database-arrow-up" },
  { label: "Delete", value: "delete", icon: "mdi-delete", disabled: true },
];

const sortItems: D2eMenuItem[] = [
  { label: "Last updated", value: "updated", selected: true },
  { label: "Name A-Z", value: "name-asc" },
  { label: "Name Z-A", value: "name-desc" },
];
</script>

<template>
  <Story title="D2eMenu" group="components">
    <Variant title="menu with icon">
      <D2eMenu :items="items" @select="selected = $event" />
    </Variant>

    <Variant title="with selection">
      <D2eMenu
        :items="
          items.map((item) => ({
            ...item,
            selected: item.value === 'duplicate',
          }))
        "
        @select="selected = $event"
      />
    </Variant>

    <Variant title="anchored to an icon button">
      <D2eMenu :items="items" @select="selected = $event">
        <template #activator="activatorProps">
          <D2eIconButton
            v-bind="activatorProps"
            icon="mdi-dots-vertical"
            aria-label="More actions"
          />
        </template>
      </D2eMenu>
    </Variant>

    <Variant title="sort by trigger">
      <D2eMenu :items="sortItems" :width="220" @select="selected = $event">
        <template #activator="activatorProps">
          <button v-bind="activatorProps" type="button" class="story-trigger">
            Sort by: Last updated
          </button>
        </template>
      </D2eMenu>
    </Variant>

    <Variant title="narrow width">
      <D2eMenu :items="items" :width="220" @select="selected = $event" />
    </Variant>
  </Story>
</template>

<style scoped>
.story-trigger {
  padding: 8px 12px;
  color: var(--d2e-color-neutral-black);
  background: transparent;
  border: 1px solid var(--d2e-color-primary-lighter);
  border-radius: 8px;
  font-family: var(--d2e-font-family);
  cursor: pointer;
}
</style>
