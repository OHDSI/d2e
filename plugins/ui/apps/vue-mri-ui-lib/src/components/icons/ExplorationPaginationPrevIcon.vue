<template>
  <!-- Exported from the pagination bar, Figma node 2976:388124. 20x20 box. -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12.2583 13.2333L9.025 10L12.2583 6.76667C12.5833 6.44167 12.5833 5.91667 12.2583 5.59167C11.9333 5.26667 11.4083 5.26667 11.0833 5.59167L7.25833 9.41667C6.93333 9.74167 6.93333 10.2667 7.25833 10.5917L11.0833 14.4167C11.4083 14.7417 11.9333 14.7417 12.2583 14.4167C12.575 14.0917 12.5833 13.5583 12.2583 13.2333Z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 20 })
</script>
