<template>
  <v-theme-provider theme="d2e" with-background style="min-height: 100%">
    <div style="padding: 24px">
      <slot />
    </div>
  </v-theme-provider>
</template>

<script setup lang="ts">
// There is exactly one D2E theme, so the atlas3 dark-mode MutationObserver
// bridge is not needed here.
</script>
