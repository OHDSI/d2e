<template>
  <!--
    Figma node 3684:161325 (Icon/file-text), exported at 140x140. The export
    carries a literal fill (#DEDCDA, --d2e-color-neutral-lighter) on every
    path; replaced with currentColor here so the colour is set once, on the
    wrapper, per knowledge/figma-assets.md.

    Sizing lives on this wrapper `<span>`, never on the `<svg>` itself — a
    class on the svg scales the artwork to fit and silently shrinks it.
  -->
  <span class="d2e-exploration-empty-illustration" aria-hidden="true">
    <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M81.6667 5.83333C84.8883 5.83333 87.5 8.44501 87.5 11.6667V40.8333H116.667C119.888 40.8333 122.5 43.445 122.5 46.6667C122.5 49.8883 119.888 52.5 116.667 52.5H81.6667C78.445 52.5 75.8333 49.8883 75.8333 46.6667V11.6667C75.8333 8.44501 78.445 5.83333 81.6667 5.83333Z"
        fill="currentColor"
      />
      <path
        d="M46.6667 70C43.445 70 40.8333 72.6117 40.8333 75.8333C40.8333 79.055 43.445 81.6667 46.6667 81.6667H93.3333C96.555 81.6667 99.1667 79.055 99.1667 75.8333C99.1667 72.6117 96.555 70 93.3333 70H46.6667Z"
        fill="currentColor"
      />
      <path
        d="M40.8333 99.1667C40.8333 95.945 43.445 93.3333 46.6667 93.3333H93.3333C96.555 93.3333 99.1667 95.945 99.1667 99.1667C99.1667 102.388 96.555 105 93.3333 105H46.6667C43.445 105 40.8333 102.388 40.8333 99.1667Z"
        fill="currentColor"
      />
      <path
        d="M46.6667 46.6667C43.445 46.6667 40.8333 49.2783 40.8333 52.5C40.8333 55.7217 43.445 58.3333 46.6667 58.3333H58.3333C61.555 58.3333 64.1667 55.7217 64.1667 52.5C64.1667 49.2783 61.555 46.6667 58.3333 46.6667H46.6667Z"
        fill="currentColor"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M35 5.83333C30.3587 5.83333 25.9075 7.67708 22.6256 10.959C19.3437 14.2409 17.5 18.692 17.5 23.3333V116.667C17.5 121.308 19.3437 125.759 22.6256 129.041C25.9075 132.323 30.3587 134.167 35 134.167H105C109.641 134.167 114.092 132.323 117.374 129.041C120.656 125.759 122.5 121.308 122.5 116.667V46.6667C122.5 45.1196 121.885 43.6358 120.791 42.5419L85.7915 7.54188C84.6975 6.44791 83.2138 5.83333 81.6667 5.83333H35ZM30.8752 19.2085C31.9692 18.1146 33.4529 17.5 35 17.5H79.2504L110.833 49.0829V116.667C110.833 118.214 110.219 119.697 109.125 120.791C108.031 121.885 106.547 122.5 105 122.5H35C33.4529 122.5 31.9692 121.885 30.8752 120.791C29.7812 119.697 29.1667 118.214 29.1667 116.667V23.3333C29.1667 21.7862 29.7812 20.3025 30.8752 19.2085Z"
        fill="currentColor"
      />
    </svg>
  </span>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
.d2e-exploration-empty-illustration {
  display: inline-flex;
  width: 140px;
  height: 140px;
  color: var(--d2e-color-neutral-lighter);

  svg {
    width: 100%;
    height: 100%;
  }
}
</style>
