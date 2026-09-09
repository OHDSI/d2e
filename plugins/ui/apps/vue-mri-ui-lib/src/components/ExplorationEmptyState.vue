<template>
  <!-- Figma node 3684:161326: a 498px centred column, illustration above two
       text lines (docs/projects/vue-mri-ui/pr12/02-empty-state.md).

       The fixed-width layout lives on an INNER div, not this root. A `class`
       passed to this component falls through onto the root regardless of
       `inheritAttrs` (Vue never gates class/style on it), and a caller's
       layout class merging with this component's own 498px-wide box is
       exactly the bug that once broke this component's centering. The root
       is `display: contents`, so it costs nothing in the parent's layout. -->
  <div class="exploration-empty-state-host">
    <div class="exploration-empty-state">
      <ExplorationEmptyIllustration />
      <div class="exploration-empty-state__text">
        <p class="exploration-empty-state__title">{{ title }}</p>
        <p class="exploration-empty-state__body">{{ body }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ExplorationEmptyIllustration from './icons/ExplorationEmptyIllustration.vue'

interface Props {
  title: string
  body: string
}

defineProps<Props>()
</script>

<style scoped lang="scss">
.exploration-empty-state-host {
  display: contents;
}

.exploration-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--d2e-spacing-s);
  width: 498px;
  max-width: 100%;
  font-family: var(--d2e-font-family);

  &__text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--d2e-spacing-xxs);
  }

  &__title {
    margin: 0;
    text-align: center;
    font-size: var(--d2e-font-subtitle1-size);
    font-weight: var(--d2e-font-subtitle1-weight);
    line-height: var(--d2e-font-subtitle1-line-height);
    color: var(--d2e-color-neutral);
  }

  &__body {
    margin: 0;
    text-align: center;
    font-size: var(--d2e-font-body1-size);
    font-weight: var(--d2e-font-body1-weight);
    line-height: var(--d2e-font-body1-line-height);
    color: var(--d2e-color-neutral);
  }
}
</style>
