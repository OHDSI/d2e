<script setup lang="ts">
import D2eCard from "./D2eCard.vue";
import D2eButton from "./D2eButton.vue";
</script>

<template>
  <Story title="D2eCard" group="components">
    <Variant title="default">
      <D2eCard title="Card title"> Card body content. </D2eCard>
    </Variant>

    <Variant title="with actions">
      <D2eCard title="Card title">
        Card body content.
        <template #actions>
          <D2eButton variant="secondary" size="sm"> Cancel </D2eButton>
          <D2eButton size="sm"> Confirm </D2eButton>
        </template>
      </D2eCard>
    </Variant>
  </Story>
</template>
