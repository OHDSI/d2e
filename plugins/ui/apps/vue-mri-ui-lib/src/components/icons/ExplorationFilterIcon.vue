<template>
  <!-- filter-list, exported from the Filters button 2634:58660.
       22x22 box; colour follows the button's currentColor. -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 22 22"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g id="filter-list">
    <path id="Vector" d="M10.0833 16.5H11.9167C12.4208 16.5 12.8333 16.0875 12.8333 15.5833C12.8333 15.0792 12.4208 14.6667 11.9167 14.6667H10.0833C9.57917 14.6667 9.16667 15.0792 9.16667 15.5833C9.16667 16.0875 9.57917 16.5 10.0833 16.5ZM2.75 6.41667C2.75 6.92083 3.1625 7.33333 3.66667 7.33333H18.3333C18.8375 7.33333 19.25 6.92083 19.25 6.41667C19.25 5.9125 18.8375 5.5 18.3333 5.5H3.66667C3.1625 5.5 2.75 5.9125 2.75 6.41667ZM6.41667 11.9167H15.5833C16.0875 11.9167 16.5 11.5042 16.5 11C16.5 10.4958 16.0875 10.0833 15.5833 10.0833H6.41667C5.9125 10.0833 5.5 10.4958 5.5 11C5.5 11.5042 5.9125 11.9167 6.41667 11.9167Z" fill="currentColor"/>
    </g>
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 22 })
</script>
