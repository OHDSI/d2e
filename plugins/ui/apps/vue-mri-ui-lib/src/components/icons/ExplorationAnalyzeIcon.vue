<template>
  <!--
    Analyze icon, card action bar 1798:192998 position 4.

    Unlike its four neighbours this is not an exported asset. Figma's SVG export
    for that instance returns a stale layer named "Bell" whose geometry is a
    bell, while the rendered node is a chart line. Rather than ship the wrong
    glyph, this uses the nearest MDI equivalent. Replace it with the exported
    asset once the instance exports correctly.
  -->
  <v-icon icon="mdi-chart-line-variant" :size="size" />
</template>

<script setup lang="ts">
import { VIcon } from 'vuetify/components'

withDefaults(defineProps<{ size?: number | string }>(), { size: 24 })
</script>
