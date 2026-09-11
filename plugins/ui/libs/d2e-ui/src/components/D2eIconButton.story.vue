<script setup lang="ts">
import D2eIconButton from "./D2eIconButton.vue";

const categories = ["no-stroke", "secondary", "primary"] as const;
</script>

<template>
  <Story title="D2eIconButton" group="components">
    <Variant title="categories">
      <div style="display: flex; gap: 12px; align-items: center">
        <D2eIconButton
          category="no-stroke"
          icon="mdi-bell"
          aria-label="Notifications"
        />
        <D2eIconButton
          category="secondary"
          icon="mdi-bell"
          aria-label="Notifications"
        />
        <D2eIconButton
          category="primary"
          icon="mdi-bell"
          aria-label="Notifications"
        />
      </div>
    </Variant>

    <Variant title="sizes">
      <div style="display: flex; gap: 12px; align-items: center">
        <D2eIconButton size="sm" icon="mdi-bell" aria-label="Small" />
        <D2eIconButton size="md" icon="mdi-bell" aria-label="Medium" />
        <D2eIconButton size="lg" icon="mdi-bell" aria-label="Large" />
      </div>
    </Variant>

    <Variant title="states (matches Figma 2006:843)">
      <!-- Mirrors the ICON BUTTON sheet: category x state. Hover and pressed
           are CSS states, so hover the row to see them. -->
      <table class="state-grid">
        <thead>
          <tr>
            <th></th>
            <th>Enabled</th>
            <th>Disabled</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cat in categories" :key="cat">
            <th scope="row">{{ cat }}</th>
            <td>
              <D2eIconButton
                :category="cat"
                size="lg"
                icon="mdi-bell-outline"
                :aria-label="`${cat} enabled`"
              />
            </td>
            <td>
              <D2eIconButton
                :category="cat"
                size="lg"
                icon="mdi-bell-outline"
                :aria-label="`${cat} disabled`"
                disabled
              />
            </td>
          </tr>
        </tbody>
      </table>
    </Variant>
  </Story>
</template>

<style scoped>
.state-grid {
  border-collapse: collapse;
}
.state-grid th,
.state-grid td {
  padding: 8px 16px;
  text-align: left;
  font:
    400 12px/1.4 system-ui,
    sans-serif;
  color: #595757;
}
.state-grid tbody th {
  font-weight: 600;
}
</style>
