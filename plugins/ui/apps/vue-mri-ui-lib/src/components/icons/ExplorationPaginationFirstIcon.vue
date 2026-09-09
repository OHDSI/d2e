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
      d="M14.75 13.2417L11.5167 10L14.7583 6.75833C15.0833 6.43333 15.0833 5.90833 14.7583 5.58333C14.4333 5.25833 13.9083 5.25833 13.5833 5.58333L9.75833 9.40833C9.43333 9.73333 9.43333 10.2583 9.75833 10.5833L13.5833 14.4083C13.9083 14.7333 14.4333 14.7333 14.7583 14.4083C15.075 14.0917 15.075 13.5583 14.75 13.2417V13.2417ZM5.83333 5C6.29167 5 6.66667 5.375 6.66667 5.83333V14.1667C6.66667 14.625 6.29167 15 5.83333 15C5.375 15 5 14.625 5 14.1667V5.83333C5 5.375 5.375 5 5.83333 5Z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 20 })
</script>
