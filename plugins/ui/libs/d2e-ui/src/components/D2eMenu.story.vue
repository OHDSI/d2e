<script setup lang="ts">
import { ref } from "vue";
import D2eMenu from "./D2eMenu.vue";
import type { D2eMenuItem } from "./D2eMenu.vue";

const selected = ref("");

const items: D2eMenuItem[] = [
  { label: "Rename", value: "rename", icon: "mdi-pencil" },
  { label: "Duplicate", value: "duplicate", icon: "mdi-content-copy" },
  { label: "Materialize", value: "materialize", icon: "mdi-database-arrow-up" },
  { label: "Delete", value: "delete", icon: "mdi-delete", disabled: true },
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
  </Story>
</template>
