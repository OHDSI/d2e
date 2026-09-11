<script setup lang="ts">
import { ref } from "vue";
import D2eTextField from "./D2eTextField.vue";

const value = ref("");
const prefilled = ref("SNRI Users");
</script>

<template>
  <Story title="D2eTextField" group="components">
    <Variant title="variants">
      <div style="display: grid; gap: 16px; max-width: 480px">
        <D2eTextField v-model="prefilled" label="Exploration name" required />
        <D2eTextField
          v-model="value"
          label="Description"
          placeholder="Enter a description"
        />
      </div>
    </Variant>

    <Variant title="states">
      <div style="display: grid; gap: 16px; max-width: 480px">
        <D2eTextField
          v-model="value"
          label="With error"
          error-messages="Cohort name already exists. Please enter another name."
        />
        <D2eTextField v-model="value" label="Disabled" disabled />
      </div>
    </Variant>
  </Story>
</template>
