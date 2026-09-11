<script setup lang="ts">
import D2eStatusChip from "./D2eStatusChip.vue";
</script>

<template>
  <Story title="D2eStatusChip" group="components">
    <Variant title="variants">
      <div style="display: flex; gap: 12px; flex-wrap: wrap">
        <D2eStatusChip variant="positive" label="Positive" />
        <D2eStatusChip variant="warning" label="Warning" />
        <D2eStatusChip variant="negative" label="Negative" />
        <D2eStatusChip variant="neutral" label="Neutral" />
        <D2eStatusChip variant="multiselect" label="Multiselect" />
      </div>
    </Variant>

    <Variant title="dataset status">
      <div style="display: flex; gap: 12px; flex-wrap: wrap">
        <D2eStatusChip
          variant="have-access"
          label="Have access"
          icon="mdi-check-circle"
        />
        <D2eStatusChip variant="pending-access" label="Pending access" />
        <D2eStatusChip variant="locked" label="Locked" icon="mdi-lock" />
      </div>
    </Variant>
  </Story>
</template>
