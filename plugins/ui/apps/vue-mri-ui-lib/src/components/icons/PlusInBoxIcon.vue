<script setup lang="ts">
const { type, size } = defineProps<{
  type: 'dark' | 'light'
  size: number
}>()
</script>
<template>
  <svg
    :width="`${size}px`"
    :height="`${size}px`"
    :viewBox="`0 0 24 24`"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
  >
    <g
      v-if="type === 'dark'"
      xmlns="http://www.w3.org/2000/svg"
      id="Icons/-Logos/-Illustrations"
      stroke="none"
      stroke-width="1"
      fill="none"
      fill-rule="evenodd"
    >
      <g id="D-Icons/Logos/Illustrations" transform="translate(-349, -123)">
        <g id="0.-Icons/Play_Round-Copy-13" transform="translate(349, 123)">
          <rect
            id="Rectangle-Copy"
            fill="var(--d2e-color-primary, #000080)"
            x="1"
            y="1"
            :width="`${size}px`"
            :height="`${size}px`"
            rx="3"
          />
          <g id="Group" transform="translate(6.5, 6.5)" fill="#FFFFFF">
            <path
              d="M9.9,4.4 C10.5075132,4.4 11,4.89248678 11,5.5 C11,6.10751322 10.5075132,6.6 9.9,6.6 L1.1,6.6 C0.492486775,6.6 0,6.10751322 0,5.5 C0,4.89248678 0.492486775,4.4 1.1,4.4 L9.9,4.4 Z"
              id="Path"
            />
            <path
              d="M5.5,0 C6.10751322,0 6.6,0.492486775 6.6,1.1 L6.6,9.9 C6.6,10.5075132 6.10751322,11 5.5,11 C4.89248678,11 4.4,10.5075132 4.4,9.9 L4.4,1.1 C4.4,0.492486775 4.89248678,0 5.5,0 Z"
              id="Path"
            />
          </g>
        </g>
      </g>
    </g>
    <g
      v-if="type === 'light'"
      xmlns="http://www.w3.org/2000/svg"
      id="Icons/-Logos/-Illustrations"
      stroke="none"
      stroke-width="1"
      fill="none"
      fill-rule="evenodd"
    >
      <g id="D-Icons/Logos/Illustrations" transform="translate(-349, -172)" fill="#000080">
        <g id="0.-Icons/Play_Round-Copy-12" transform="translate(349, 172)">
          <path
            d="M20,1 C21.6568542,1 23,2.34314575 23,4 L23,20 C23,21.6568542 21.6568542,23 20,23 L4,23 C2.34314575,23 1,21.6568542 1,20 L1,4 C1,2.34314575 2.34314575,1 4,1 L20,1 Z M19.8,3.2 L4.2,3.2 C3.64771525,3.2 3.2,3.64771525 3.2,4.2 L3.2,19.8 C3.2,20.3522847 3.64771525,20.8 4.2,20.8 L19.8,20.8 C20.3522847,20.8 20.8,20.3522847 20.8,19.8 L20.8,4.2 C20.8,3.64771525 20.3522847,3.2 19.8,3.2 Z M12,6.5 C12.6075132,6.5 13.1,6.99248678 13.1,7.6 L13.1,10.9 L16.4,10.9 C17.0075132,10.9 17.5,11.3924868 17.5,12 C17.5,12.6075132 17.0075132,13.1 16.4,13.1 L13.1,13.1 L13.1,16.4 C13.1,17.0075132 12.6075132,17.5 12,17.5 C11.3924868,17.5 10.9,17.0075132 10.9,16.4 L10.9,13.1 L7.6,13.1 C6.99248678,13.1 6.5,12.6075132 6.5,12 C6.5,11.3924868 6.99248678,10.9 7.6,10.9 L10.9,10.9 L10.9,7.6 C10.9,6.99248678 11.3924868,6.5 12,6.5 Z"
            id="Combined-Shape"
          />
        </g>
      </g>
    </g>
  </svg>
</template>
<script lang="ts">
export default {
  name: 'PlusInBoxIcon',
}
</script>
