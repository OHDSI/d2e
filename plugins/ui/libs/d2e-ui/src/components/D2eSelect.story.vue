<script setup lang="ts">
import { ref } from "vue";
import D2eSelect from "./D2eSelect.vue";
import type { D2eSelectItem } from "./selectSizes";

const items: D2eSelectItem[] = [
  { label: "Last updated", value: "updated" },
  { label: "Name", value: "name" },
  { label: "Patient count", value: "patients" },
  { label: "Archived", value: "archived", disabled: true },
];

const withValue = ref<string>("updated");
const empty = ref<string | null>(null);
const focused = ref<string>("name");
const disabled = ref<string>("updated");
const errored = ref<string | null>(null);
const withHint = ref<string>("name");
const many = ref<string[]>(["updated", "name"]);
const withIcon = ref<string>("name");
const small = ref<string>("updated");
const medium = ref<string>("updated");
</script>

<template>
  <Story title="D2eSelect" group="components">
    <Variant title="enabled with value">
      <D2eSelect v-model="withValue" :items="items" label="Sort by" />
    </Variant>

    <Variant title="placeholder, no value">
      <D2eSelect
        v-model="empty"
        :items="items"
        label="Sort by"
        placeholder="Select an option"
      />
    </Variant>

    <Variant title="focused">
      <D2eSelect v-model="focused" :items="items" label="Sort by" autofocus />
    </Variant>

    <Variant title="disabled">
      <D2eSelect v-model="disabled" :items="items" label="Sort by" disabled />
    </Variant>

    <Variant title="error">
      <D2eSelect
        v-model="errored"
        :items="items"
        label="Sort by"
        error-messages="Select an option"
      />
    </Variant>

    <Variant title="with helper text">
      <D2eSelect
        v-model="withHint"
        :items="items"
        label="Sort by"
        hint="Applies to the exploration list"
      />
    </Variant>

    <Variant title="multiple">
      <D2eSelect v-model="many" :items="items" label="Authors" multiple />
    </Variant>

    <Variant title="with prepend icon">
      <D2eSelect
        v-model="withIcon"
        :items="items"
        label="Author"
        prepend-icon="mdi-account"
      />
    </Variant>

    <Variant title="sizes">
      <div style="display: flex; gap: 16px; align-items: flex-start">
        <D2eSelect v-model="small" :items="items" label="Small" size="sm" />
        <D2eSelect v-model="medium" :items="items" label="Medium" size="md" />
      </div>
    </Variant>
  </Story>
</template>
