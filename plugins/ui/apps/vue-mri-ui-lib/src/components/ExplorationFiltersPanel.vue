<template>
  <!-- Figma 2697:211983 — a 420x432 paper anchored under the Filters button.
       Geometry and type sizes are in
       docs/projects/vue-mri-ui/pr8/00-session-corrections.md section 2. -->
  <div class="filters-panel" data-testid="explorations-filters-panel">
    <header class="filters-panel__header">
      <span class="filters-panel__title">{{ getText('MRI_PA_EXPLORATIONS_FILTERS_TITLE') }}</span>
      <D2eButton
        variant="ghost"
        class="filters-panel__clear"
        :disabled="isEmpty(modelValue)"
        data-testid="explorations-filters-clear"
        @click="$emit('clear')"
      >
        {{ getText('MRI_PA_EXPLORATIONS_FILTERS_CLEAR') }}
      </D2eButton>
    </header>

    <div class="filters-panel__body">
      <D2eSelect
        size="sm"
        multiple
        hide-details
        :items="authorItems"
        :model-value="modelValue.authors"
        :placeholder="getText('MRI_PA_EXPLORATIONS_FILTER_AUTHOR')"
        prepend-icon="mdi-account-outline"
        data-testid="explorations-filter-author"
        @update:model-value="patch({ authors: ($event as string[]) ?? [] })"
      />

      <D2eSelect
        size="sm"
        multiple
        hide-details
        :items="statusItems"
        :model-value="modelValue.statuses"
        :placeholder="getText('MRI_PA_EXPLORATIONS_FILTER_STATUS')"
        prepend-icon="mdi-check-circle-outline"
        data-testid="explorations-filter-status"
        @update:model-value="patch({ statuses: ($event as MaterializationStatus[]) ?? [] })"
      />

      <div v-for="group in dateGroups" :key="group.key" class="filters-panel__group">
        <span class="filters-panel__group-label">{{ getText(group.labelKey) }}</span>
        <div class="filters-panel__range">
          <!-- Cross-bound so the picker cannot produce an inverted range: the
               From field's max is the current `to`, and the reverse. -->
          <D2eDateField
            :model-value="modelValue[group.key].from"
            :label="getText('MRI_PA_EXPLORATIONS_FILTER_FROM')"
            :max="modelValue[group.key].to"
            :disabled="group.disabled"
            :aria-label="`${getText(group.labelKey)} ${getText('MRI_PA_EXPLORATIONS_FILTER_FROM')}`"
            :data-testid="`explorations-filter-${group.key}-from`"
            @update:model-value="patchRange(group.key, { from: $event })"
          />
          <D2eDateField
            :model-value="modelValue[group.key].to"
            :label="getText('MRI_PA_EXPLORATIONS_FILTER_TO')"
            :min="modelValue[group.key].from"
            :disabled="group.disabled"
            :aria-label="`${getText(group.labelKey)} ${getText('MRI_PA_EXPLORATIONS_FILTER_TO')}`"
            :data-testid="`explorations-filter-${group.key}-to`"
            @update:model-value="patchRange(group.key, { to: $event })"
          />
        </div>
        <!-- CREATED is backend-blocked: a bookmark carries no creation
             timestamp. The group renders so the panel matches the frame, and
             says why it is inert rather than reading as an oversight. -->
        <p v-if="group.disabled" class="filters-panel__note">
          {{ getText('MRI_PA_EXPLORATIONS_FILTER_CREATED_UNAVAILABLE') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import { D2eButton, D2eDateField, D2eSelect } from '@d2e/ui'
import type { D2eSelectItem } from '@d2e/ui'
import { isEmpty, type DateRange, type ExplorationFilters, type MaterializationStatus } from './helpers/explorationFilters'

interface Props {
  modelValue: ExplorationFilters
  /** Distinct owners across the whole loaded list, not the filtered one. */
  authors: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: ExplorationFilters]
  clear: []
}>()

const store = useStore()

const getText = (key: string): string => {
  const resolver = store.getters.getText
  return typeof resolver === 'function' ? resolver(key) : key
}

/** The three date ranges, in the frame's order. Only CREATED is blocked. */
type DateGroupKey = 'created' | 'lastUpdated' | 'lastMaterialized'

const dateGroups: { key: DateGroupKey; labelKey: string; disabled: boolean }[] = [
  { key: 'created', labelKey: 'MRI_PA_EXPLORATIONS_FILTER_CREATED', disabled: true },
  { key: 'lastUpdated', labelKey: 'MRI_PA_EXPLORATIONS_FILTER_LAST_UPDATED', disabled: false },
  { key: 'lastMaterialized', labelKey: 'MRI_PA_EXPLORATIONS_FILTER_LAST_MATERIALIZED', disabled: false },
]

const authorItems = computed<D2eSelectItem[]>(() => props.authors.map(name => ({ label: name, value: name })))

const statusItems = computed<D2eSelectItem[]>(() => [
  { label: getText('MRI_PA_EXPLORATIONS_FILTER_MATERIALIZED'), value: 'materialized' },
  { label: getText('MRI_PA_EXPLORATIONS_FILTER_NOT_MATERIALIZED'), value: 'not-materialized' },
])

/**
 * The panel is controlled and never mutates its prop: every change emits a
 * new object. Mutating `modelValue` in place would leave the page's `cards`
 * computed with no dependency change to react to.
 */
const patch = (part: Partial<ExplorationFilters>): void => {
  emit('update:modelValue', { ...props.modelValue, ...part })
}

/** A range change replaces the range object too, never assigns into it. */
const patchRange = (key: DateGroupKey, part: Partial<DateRange>): void => {
  patch({ [key]: { ...props.modelValue[key], ...part } } as Partial<ExplorationFilters>)
}
</script>

<style scoped lang="scss">
.filters-panel {
  width: 420px;
  background: var(--d2e-color-white);
  border-radius: var(--d2e-radius-md);
  box-shadow: var(--d2e-elevation-e8);
  font-family: var(--d2e-font-family);
  overflow: hidden;

  /* 420x52 with a 1px neutral rule beneath (Figma 2697:211985). */
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 var(--d2e-spacing-s);
    border-bottom: var(--d2e-border-width-sm) solid var(--d2e-color-neutral);
  }

  /* 10px SemiBold Primary, 1px tracking, uppercased here and not in the
     string so the translations stay readable (Figma 2697:211986). */
  &__title {
    font-size: var(--d2e-font-caption2-size);
    font-weight: var(--d2e-font-subtitle1-weight);
    line-height: 1.5;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--d2e-color-primary);
  }

  /* 139x29, 14px SemiBold Neutral/Light (Figma 2697:211987). `ghost` is the
     nearest D2eButton variant; its 40px height and 16px Medium label are
     wrong for this one place. */
  &__clear {
    height: 29px;
    padding: var(--d2e-spacing-xxs) var(--d2e-spacing-xs);

    :deep(.v-btn__content) {
      font-size: var(--d2e-font-subtitle2-size);
      font-weight: var(--d2e-font-subtitle2-weight);
      line-height: 1.5;
      letter-spacing: normal;
      text-transform: none;
      color: var(--d2e-color-neutral-light);
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--d2e-spacing-s);
    padding: var(--d2e-spacing-s);
  }

  /* 388x68: a 24px heading row, then the 40px field row, 4px apart. */
  &__group {
    display: flex;
    flex-direction: column;
    gap: var(--d2e-spacing-xxs);
  }

  &__group-label {
    display: flex;
    align-items: center;
    height: 24px;
    font-size: var(--d2e-font-caption2-size);
    font-weight: var(--d2e-font-subtitle1-weight);
    line-height: 1.5;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--d2e-color-neutral);
  }

  /* Two 186px fields, 16px apart. */
  &__range {
    display: flex;
    gap: var(--d2e-spacing-s);

    > * {
      flex: 1 1 0;
      min-width: 0;
    }
  }

  &__note {
    margin: 0;
    font-size: var(--d2e-font-caption1-size);
    line-height: 1.4;
    color: var(--d2e-color-neutral-light);
  }
}
</style>

<!-- Not scoped: the panel is teleported into `.v-overlay-container`, a direct
     child of <body>, so it sits outside `.mri-app-vue-container` and every
     rule scoped to that container stops applying. Two of them matter here.
     `ExplorationsPage.vue` carries the same kind of block for tooltips. -->
<style lang="scss">
/* `vuetify-settings.scss` sets `$reset: false`, so Vuetify's reset never runs
   and every <input> keeps the browser's 2px inset border. `style.scss`
   compensates for that, but only inside `.mri-app-vue-container`. Out here the
   border comes back and draws a box around each placeholder. */
.filters-panel {
  .v-field__input,
  .v-field input,
  .v-field select,
  .v-field textarea {
    background-color: transparent;
    border-style: none;
  }

  /* The frame writes both placeholders in Neutral/Default, not the lighter
     grey D2eSelect and D2eDateField use elsewhere (Figma 2697:211989 and
     2697:211995). `.v-input` is in the selector only to outrank the two
     components' own scoped rules, which carry a `[data-v-*]` attribute. */
  .v-input .v-field__input::placeholder,
  .v-input .v-field__input input::placeholder {
    color: var(--d2e-color-neutral);
    opacity: 1;
  }
}
</style>
