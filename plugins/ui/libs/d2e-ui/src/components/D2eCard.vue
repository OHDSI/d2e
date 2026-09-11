<template>
  <section class="d2e-card" :style="{ width }">
    <header v-if="title || $slots.header" class="d2e-card__header">
      <slot name="header">{{ title }}</slot>
    </header>
    <div class="d2e-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer || $slots.actions" class="d2e-card__footer">
      <slot name="footer" />
      <slot name="actions" />
    </footer>
  </section>
</template>

<script setup lang="ts">
interface Props {
  title?: string;
  width?: string;
}

withDefaults(defineProps<Props>(), {
  title: undefined,
  width: "336px",
});
</script>

<style scoped lang="scss">
// Values from design-system/card.md (Cohort Card 1798:193716).
.d2e-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--d2e-color-neutral-xtra-lightest);
  border-radius: 12px;
  box-shadow: var(--d2e-elevation-card);
  font-family: var(--d2e-font-family);

  &__header {
    font-size: var(--d2e-font-heading5-size);
    font-weight: var(--d2e-font-heading5-weight);
    line-height: var(--d2e-font-heading5-line-height);
    color: var(--d2e-color-primary);
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--d2e-color-neutral-lighter);
  }
}
</style>
