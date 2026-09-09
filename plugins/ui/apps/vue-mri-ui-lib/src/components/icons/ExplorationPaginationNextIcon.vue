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
      d="M7.74167 5.59167C7.41667 5.91667 7.41667 6.44167 7.74167 6.76667L10.975 10L7.74167 13.2333C7.41667 13.5583 7.41667 14.0833 7.74167 14.4083C8.06667 14.7333 8.59167 14.7333 8.91667 14.4083L12.7417 10.5833C13.0667 10.2583 13.0667 9.73333 12.7417 9.40833L8.91667 5.58333C8.6 5.26667 8.06667 5.26667 7.74167 5.59167Z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 20 })
</script>
