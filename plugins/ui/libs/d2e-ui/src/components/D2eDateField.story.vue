<script setup lang="ts">
import { ref } from "vue";
import D2eDateField from "./D2eDateField.vue";

const empty = ref<string | null>(null);
const withValue = ref<string | null>("2026-01-31");
const disabled = ref<string | null>("2026-01-31");
const minMax = ref<string | null>(null);
const from = ref<string | null>(null);
const to = ref<string | null>(null);
</script>

<template>
  <Story title="D2eDateField" group="components">
    <Variant title="empty">
      <D2eDateField v-model="empty" label="From" />
    </Variant>

    <Variant title="with value">
      <D2eDateField v-model="withValue" label="From" />
    </Variant>

    <Variant title="disabled">
      <D2eDateField v-model="disabled" label="From" disabled />
    </Variant>

    <Variant title="with min and max">
      <D2eDateField
        v-model="minMax"
        label="From"
        min="2026-01-01"
        max="2026-12-31"
      />
    </Variant>

    <Variant title="From / To pair">
      <div>
        <div
          style="
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: var(--d2e-color-neutral);
            margin-bottom: 4px;
          "
        >
          Created
        </div>
        <div style="display: flex; gap: 16px">
          <D2eDateField v-model="from" label="From" style="width: 186px" />
          <D2eDateField v-model="to" label="To" style="width: 186px" />
        </div>
      </div>
    </Variant>
  </Story>
</template>
