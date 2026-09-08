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
      d="M5.24167 6.75833L8.48333 10L5.24167 13.2417C4.91667 13.5667 4.91667 14.0917 5.24167 14.4167C5.56667 14.7417 6.09167 14.7417 6.41667 14.4167L10.2417 10.5917C10.5667 10.2667 10.5667 9.74167 10.2417 9.41667L6.41667 5.58333C6.09167 5.25833 5.56667 5.25833 5.24167 5.58333C4.925 5.90833 4.925 6.44167 5.24167 6.75833ZM14.1667 5C14.625 5 15 5.375 15 5.83333V14.1667C15 14.625 14.625 15 14.1667 15C13.7083 15 13.3333 14.625 13.3333 14.1667V5.83333C13.3333 5.375 13.7083 5 14.1667 5Z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 20 })
</script>
