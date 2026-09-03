<script setup lang="ts">
import { ref } from "vue";
import D2eCheckbox from "./D2eCheckbox.vue";

const unchecked = ref(false);
const checked = ref(true);
const partial = ref(false);
const disabledUnchecked = ref(false);
const disabledChecked = ref(true);
const labelled = ref(true);
const small = ref(true);
const medium = ref(true);
</script>

<template>
  <Story title="D2eCheckbox" group="components">
    <Variant title="unchecked">
      <D2eCheckbox v-model="unchecked" aria-label="Unchecked" />
    </Variant>

    <Variant title="checked">
      <D2eCheckbox v-model="checked" aria-label="Checked" />
    </Variant>

    <Variant title="indeterminate">
      <D2eCheckbox v-model="partial" indeterminate aria-label="Some selected" />
    </Variant>

    <Variant title="disabled unchecked">
      <D2eCheckbox
        v-model="disabledUnchecked"
        disabled
        aria-label="Disabled unchecked"
      />
    </Variant>

    <Variant title="disabled checked">
      <D2eCheckbox
        v-model="disabledChecked"
        disabled
        aria-label="Disabled checked"
      />
    </Variant>

    <Variant title="with label">
      <D2eCheckbox v-model="labelled" label="Select this exploration" />
    </Variant>

    <Variant title="sizes">
      <div style="display: flex; align-items: center; gap: 16px">
        <D2eCheckbox v-model="small" size="sm" aria-label="Small" />
        <D2eCheckbox v-model="medium" size="md" aria-label="Medium" />
      </div>
    </Variant>
  </Story>
</template>
