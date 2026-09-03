<template>
  <section
    class="d2e-exploration-card"
    :class="{ 'd2e-exploration-card--clickable': clickable }"
    :style="{ width }"
  >
    <div class="d2e-exploration-card__head">
      <div class="d2e-exploration-card__title-row">
        <h3 v-truncation-title class="d2e-exploration-card__title">{{ name }}</h3>
        <v-checkbox
          class="d2e-exploration-card__checkbox"
          :model-value="selected"
          density="compact"
          hide-details
          :ripple="false"
          :aria-label="checkboxLabel"
          @update:model-value="$emit('update:selected', $event)"
        />
      </div>

      <div class="d2e-exploration-card__body">
        <div class="d2e-exploration-card__lead-row">
          <!-- `not-run` has no count yet, so the slot carries the Materialize
               action in its place (Figma 1810:239211). -->
          <slot name="lead">
            <p v-if="personCount != null" class="d2e-exploration-card__count">
              <span class="d2e-exploration-card__count-value">{{
                personCount
              }}</span>
              <span class="d2e-exploration-card__count-unit">{{
                personLabel
              }}</span>
            </p>
          </slot>

          <D2eStatusChip
            v-if="resolvedStatus"
            :variant="resolvedStatus.variant"
            :label="resolvedStatus.label"
            :icon="resolvedStatus.icon"
          />
        </div>

        <dl v-if="metadata.length" class="d2e-exploration-card__rows">
          <div
            v-for="row in metadata"
            :key="row.label"
            class="d2e-exploration-card__row"
          >
            <dt class="d2e-exploration-card__row-label">{{ row.label }}</dt>
            <dd v-truncation-title class="d2e-exploration-card__row-value">
              {{ row.value }}
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <div v-if="bookmark.length" class="d2e-exploration-card__details">
      <div class="d2e-exploration-card__panel">
        <div class="d2e-exploration-card__panel-head">
          <span class="d2e-exploration-card__panel-title">{{
            bookmarkTitle
          }}</span>
          <span class="d2e-exploration-card__panel-rule" />
        </div>
        <dl class="d2e-exploration-card__rows">
          <div
            v-for="row in bookmark"
            :key="row.label"
            class="d2e-exploration-card__row"
          >
            <dt class="d2e-exploration-card__row-label">{{ row.label }}</dt>
            <dd v-truncation-title class="d2e-exploration-card__row-value">
              {{ row.value }}
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <div v-if="$slots.toolbar" class="d2e-exploration-card__actions">
      <div class="d2e-exploration-card__actions-group">
        <slot name="toolbar" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { EXPLORATION_STATUS_MAP } from "./explorationCardStatus";
import type {
  D2eExplorationCardRow,
  D2eExplorationCardStatus,
} from "./explorationCardStatus";
import { VCheckbox } from "vuetify/components";
import { computed } from "vue";
import D2eStatusChip from "./D2eStatusChip.vue";
import { vTruncationTitle } from "./truncation";

interface Props {
  name: string;
  width?: string;
  selected?: boolean;
  checkboxLabel?: string;
  status?: D2eExplorationCardStatus;
  /** Pre-formatted for the reader's locale, e.g. "223,888,432". */
  personCount?: string | number;
  personLabel?: string;
  metadata?: D2eExplorationCardRow[];
  bookmarkTitle?: string;
  bookmark?: D2eExplorationCardRow[];
  /** Paints the hover state and a pointer cursor, for a card that opens on click. */
  clickable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  width: "336px",
  clickable: false,
  selected: false,
  checkboxLabel: "Select exploration",
  status: undefined,
  personCount: undefined,
  personLabel: "persons",
  metadata: () => [],
  bookmarkTitle: "Exploration bookmark",
  bookmark: () => [],
});

defineEmits<{ "update:selected": [value: boolean] }>();

const resolvedStatus = computed(() =>
  props.status ? EXPLORATION_STATUS_MAP[props.status] : undefined,
);
</script>

<style scoped lang="scss">
// Figma 1810:239212. The card surface is white with a 1px border; the
// #FAF8F8 panel is the nested bookmark block, not the card itself.
.d2e-exploration-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: var(--d2e-color-white);
  border: var(--d2e-border-width-sm) solid var(--d2e-color-neutral-lighter);
  border-radius: var(--d2e-radius-lg);
  box-shadow: var(--d2e-elevation-card);
  font-family: var(--d2e-font-family);

  // Without this the card gives the reader no sign it opens on click.
  &--clickable {
    cursor: pointer;
    transition:
      box-shadow 120ms ease-in-out,
      border-color 120ms ease-in-out;

    &:hover {
      border-color: var(--d2e-color-primary-light);
      box-shadow: var(--d2e-elevation-e8);
    }

    &:focus-visible {
      outline: var(--d2e-border-width-md) solid var(--d2e-color-primary-light);
      outline-offset: 2px;
    }
  }

  &__head {
    display: flex;
    flex-direction: column;
    gap: var(--d2e-spacing-xs);
    padding: var(--d2e-spacing-m) var(--d2e-spacing-s) var(--d2e-spacing-xs-s);
    overflow: hidden;
  }

  &__title-row {
    display: flex;
    align-items: center;
    width: 100%;
  }

  &__title {
    flex: 1 0 0;
    min-width: 0;
    margin: 0;
    font-size: var(--d2e-font-heading5-size);
    font-weight: var(--d2e-font-heading5-weight);
    line-height: var(--d2e-font-heading5-line-height);
    color: var(--d2e-color-neutral-black);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__checkbox {
    flex: none;
    // The design reserves a 20px box (Figma 1798:192958); Vuetify's selection
    // control carries far more padding than that.
    margin-inline-start: var(--d2e-spacing-xs);

    :deep(.v-selection-control) {
      min-height: 20px;
    }

    :deep(.v-selection-control__wrapper) {
      width: 20px;
      height: 20px;
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--d2e-spacing-xxs);
  }

  &__lead-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--d2e-spacing-xs);
    height: 40px;
    margin-bottom: var(--d2e-spacing-xs);
    overflow: hidden;
  }

  &__count {
    display: flex;
    align-items: flex-end;
    gap: var(--d2e-spacing-xs);
    margin: 0;
    color: var(--d2e-color-neutral-black);
    white-space: nowrap;
  }

  &__count-value {
    font-size: var(--d2e-font-heading4-size);
    font-weight: var(--d2e-font-heading4-weight);
    line-height: var(--d2e-font-heading4-line-height);
    letter-spacing: var(--d2e-font-heading4-letter-spacing);
  }

  &__count-unit {
    font-size: var(--d2e-font-body2-size);
    font-weight: var(--d2e-font-body2-weight);
    line-height: var(--d2e-font-body2-line-height);
  }

  &__rows {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--d2e-spacing-xs);
    overflow: hidden;
  }

  &__row-label {
    flex: none;
    font-size: var(--d2e-font-body2-size);
    font-weight: var(--d2e-font-body2-weight);
    line-height: var(--d2e-font-body2-line-height);
    color: var(--d2e-color-neutral);
    white-space: nowrap;
  }

  &__row-value {
    flex: 1 0 0;
    min-width: 0;
    margin: 0;
    font-size: var(--d2e-font-subtitle2-size);
    font-weight: var(--d2e-font-subtitle2-weight);
    line-height: var(--d2e-font-subtitle2-line-height);
    color: var(--d2e-color-primary);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__details {
    padding: 0 var(--d2e-spacing-xs-s) var(--d2e-spacing-xs-s);
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: var(--d2e-spacing-xs);
    padding: var(--d2e-spacing-xs-s);
    background: var(--d2e-color-neutral-xtra-lightest);
    border: var(--d2e-border-width-sm) solid var(--d2e-color-neutral-lighter);
    border-radius: var(--d2e-spacing-xs-s);
  }

  &__panel-head {
    display: flex;
    align-items: center;
    gap: var(--d2e-spacing-xs);
  }

  &__panel-title {
    flex: none;
    font-size: var(--d2e-font-subtitle2-size);
    font-weight: var(--d2e-font-subtitle2-weight);
    line-height: var(--d2e-font-subtitle2-line-height);
    color: var(--d2e-color-neutral);
    white-space: nowrap;
  }

  &__panel-rule {
    flex: 1 0 0;
    min-width: 0;
    height: 1px;
    background: var(--d2e-color-neutral-light);
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--d2e-spacing-xxs) var(--d2e-spacing-xs);
    border-top: var(--d2e-border-width-sm) solid var(--d2e-color-neutral);
  }

  &__actions-group {
    display: flex;
    align-items: center;
    gap: var(--d2e-spacing-xxs);
  }
}
</style>
