<script setup lang="ts">
import D2eButton from "./D2eButton.vue";
</script>

<template>
  <Story title="D2eButton" group="components">
    <Variant title="variants">
      <div style="display: flex; gap: 12px; flex-wrap: wrap">
        <D2eButton variant="primary"> Primary </D2eButton>
        <D2eButton variant="secondary"> Secondary </D2eButton>
        <D2eButton variant="danger"> Danger </D2eButton>
        <D2eButton variant="ghost"> Ghost </D2eButton>
      </div>
    </Variant>

    <Variant title="sizes">
      <div style="display: flex; gap: 12px; align-items: center">
        <D2eButton size="sm"> Small </D2eButton>
        <D2eButton size="md"> Medium </D2eButton>
        <D2eButton size="lg"> Large </D2eButton>
      </div>
    </Variant>

    <Variant title="states">
      <div style="display: flex; gap: 12px">
        <D2eButton> Default </D2eButton>
        <D2eButton loading> Loading </D2eButton>
        <D2eButton disabled> Disabled </D2eButton>
      </div>
    </Variant>

    <Variant title="icon front">
      <div class="row">
        <D2eButton prepend-icon="mdi-bell"> Label </D2eButton>
        <D2eButton prepend-icon="mdi-bell" variant="secondary">
          Label
        </D2eButton>
      </div>
    </Variant>

    <Variant title="icon back">
      <div class="row">
        <D2eButton append-icon="mdi-bell"> Label </D2eButton>
        <D2eButton append-icon="mdi-bell" variant="secondary">
          Label
        </D2eButton>
      </div>
    </Variant>

    <Variant title="block">
      <div style="display: flex; gap: 16px">
        <D2eButton variant="secondary" block> Cancel </D2eButton>
        <D2eButton block> Confirm </D2eButton>
      </div>
    </Variant>
  </Story>
</template>
