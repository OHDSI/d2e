<script setup lang="ts">
/**
 * Headline pass rates above the matrix, Figma node 1747:229860: the overall rate
 * with its corrected-rate footnote, plus one tile per DQD category. Every number
 * comes from the same `total` group the matrix's last four columns render, so the
 * tile percentage and its row always agree.
 *
 * The endpoint ships no prose, so the tooltip copy lives here: the corrected-rate
 * notes mirror the portal's OVERVIEW_TABLE__NOTE_1..3 strings, and the category
 * hints paraphrase the Kahn framework definitions DQD organises its checks by.
 */
import { computed } from 'vue';
import { AtlasIcon, AtlasTooltip } from '@ohdsi/atlas-ui';
import type { OverviewResults } from '../api/dqd';
import { formatNumber, formatPercent } from '../utils/format';

const props = defineProps<{ data: OverviewResults }>();

const CATEGORIES = [
  {
    key: 'plausibility',
    label: 'Plausibility',
    hint: 'Are the values believable? Checks that values, distributions and event sequences make clinical and temporal sense.',
  },
  {
    key: 'conformance',
    label: 'Conformance',
    hint: 'Do the data follow the CDM specification? Checks value formats, data types, vocabulary use and referential integrity.',
  },
  {
    key: 'completeness',
    label: 'Completeness',
    hint: 'Are the expected data there? Checks for missing values in tables and fields that should be populated.',
  },
] as const;

const overall = computed(() => props.data.total.total);

const categories = computed(() =>
  CATEGORIES.map(({ key, label, hint }) => {
    const cell = props.data.total[key];
    return {
      key,
      label,
      hint,
      percentPass: formatPercent(cell.percentPass),
      pass: formatNumber(cell.pass),
      fail: formatNumber(cell.fail),
      total: formatNumber(cell.total),
    };
  }),
);

const correctedRateNotes = computed(() => {
  const cell = overall.value;
  return [
    `${formatNumber(cell.allNa)} out of ${formatNumber(cell.pass)} passed checks are not applicable, due to empty tables or fields.`,
    `${formatNumber(cell.allError)} out of ${formatNumber(cell.fail)} failed checks are SQL errors.`,
    `Corrected pass percentage for NA and Errors: ${formatPercent(
      cell.correctedPassPercentage,
    )} (${formatNumber(cell.PassMinusAllNA)}/${formatNumber(
      cell.totalMinusAllErrorMinusAllNA,
    )}).`,
  ];
});
</script>

<template>
  <div class="dq-summary">
    <div class="dq-summary__headline">
      <p class="dq-summary__rate">
        <span class="dq-summary__rate-value" data-testid="dq-overall-pass-rate">
          {{ formatPercent(overall.percentPass) }}
        </span>
        <span class="dq-summary__rate-label">Overall pass rate</span>
      </p>
      <div class="dq-summary__notes">
        <p class="dq-summary__corrected">
          <span data-testid="dq-corrected-pass-rate">
            Corrected pass rate {{ formatPercent(overall.correctedPassPercentage) }} –
            calculation info
          </span>
          <AtlasTooltip location="bottom" max-width="360">
            <template #activator="{ props: activator }">
              <button
                v-bind="activator"
                class="dq-info"
                type="button"
                aria-label="How the corrected pass rate is calculated"
              >
                <AtlasIcon icon="mdi-information-outline" size="20" />
              </button>
            </template>
            <p v-for="note in correctedRateNotes" :key="note" class="dq-tooltip__line">
              {{ note }}
            </p>
          </AtlasTooltip>
        </p>
        <p class="dq-summary__checks">
          {{ formatNumber(overall.pass) }} of {{ formatNumber(overall.total) }} checks
        </p>
      </div>
    </div>

    <ul class="dq-summary__tiles">
      <li v-for="category in categories" :key="category.key" class="dq-tile">
        <div class="dq-tile__head">
          <span class="dq-tile__title">{{ category.label }}</span>
          <AtlasTooltip location="bottom" max-width="320">
            <template #activator="{ props: activator }">
              <button
                v-bind="activator"
                class="dq-info"
                type="button"
                :aria-label="`What ${category.label} checks measure`"
              >
                <AtlasIcon icon="mdi-information-outline" size="20" />
              </button>
            </template>
            <p class="dq-tooltip__line">{{ category.hint }}</p>
          </AtlasTooltip>
        </div>
        <p class="dq-tile__value" :data-testid="`dq-tile-${category.key}`">
          {{ category.percentPass }}
        </p>
        <p class="dq-tile__breakdown">
          <span>{{ category.pass }} pass</span>
          <span class="dq-tile__separator" aria-hidden="true">·</span>
          <span>{{ category.fail }} fail</span>
          <span class="dq-tile__separator" aria-hidden="true">·</span>
          <span>{{ category.total }} total</span>
        </p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.dq-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: var(--dq-space-xl);
  min-height: 140px;
  font-family: var(--dq-font);
  color: var(--dq-text);
}

.dq-summary__headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
}

.dq-summary__rate {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-weight: 600;
}

.dq-summary__rate-value {
  font-size: 48px;
  line-height: 1.2;
  letter-spacing: -0.96px;
}

.dq-summary__rate-label {
  font-size: 16px;
  line-height: 1.5;
}

.dq-summary__notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--dq-text-muted);
  font-size: 16px;
  line-height: 1.5;
}

.dq-summary__corrected {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-weight: 600;
}

.dq-summary__checks {
  margin: 0;
}

.dq-summary__tiles {
  display: flex;
  flex: 1 1 480px;
  gap: 16px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dq-tile {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  padding: var(--dq-space-s);
  background: var(--dq-surface-subtle);
  border: 1px solid var(--dq-border-subtle);
  border-radius: var(--dq-radius-sm);
}

.dq-tile__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dq-tile__title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.dq-tile__value {
  margin: 0;
  font-size: 34px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.68px;
}

.dq-tile__breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.dq-tile__separator {
  font-size: 16px;
}

/* Icon-only trigger: a real button so the tooltip is reachable by keyboard. */
.dq-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: help;
}

.dq-info:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 2px;
  border-radius: 50%;
}

.dq-tooltip__line {
  margin: 0;
}

.dq-tooltip__line + .dq-tooltip__line {
  margin-top: 4px;
}
</style>
