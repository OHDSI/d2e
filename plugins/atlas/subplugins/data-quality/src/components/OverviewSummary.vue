<script setup lang="ts">
/**
 * Headline pass rates above the matrix, Figma node 1747:229860: the overall rate
 * with its corrected-rate footnote, plus one tile per DQD category. Every number
 * comes from the same `total` group the matrix's last four columns render, so the
 * tile percentage and its row always agree.
 *
 * The endpoint ships no prose, so the tooltip copy lives here: the corrected-rate
 * notes mirror the portal's OVERVIEW_TABLE__NOTE_1..3 strings, and the category
 * explanations are the ones written into Figma node 1773:370246, verbatim.
 */
import { computed } from 'vue';
import { AtlasIcon } from '@ohdsi/atlas-ui';
import DqTooltip from './DqTooltip.vue';
import type { OverviewResults } from '../api/dqd';
import { formatNumber, formatPercent } from '../utils/format';

const props = defineProps<{ data: OverviewResults }>();

const CATEGORIES = [
  {
    key: 'plausibility',
    label: 'Plausibility',
    lead: 'Are the values clinically believable?',
    detail:
      "Values are clinically and logically believable — e.g. a patient's age, drug dosage, or lab result falls within an expected range. Flags records that are possible but unlikely.",
  },
  {
    key: 'conformance',
    label: 'Conformance',
    lead: 'Does the data follow OMOP structural rules?',
    detail:
      "Data follows the structural rules of the OMOP Common Data Model — correct formats, valid concept IDs, required fields populated. Flags records that don't match the expected schema.",
  },
  {
    key: 'completeness',
    label: 'Completeness',
    lead: 'Are the expected fields populated?',
    detail:
      'Key fields expected to be present are actually populated. Flags records where important clinical data is missing or null.',
  },
] as const;

const overall = computed(() => props.data.total.total);

const categories = computed(() =>
  CATEGORIES.map(({ key, label, lead, detail }) => {
    const cell = props.data.total[key];
    return {
      key,
      label,
      lead,
      detail,
      percentPass: formatPercent(cell.percentPass),
      pass: formatNumber(cell.pass),
      fail: formatNumber(cell.fail),
      total: formatNumber(cell.total),
    };
  }),
);

/**
 * The two counts the correction is made from. The design states the rule as a
 * formula and then shows what went into it, rather than the portal's third note
 * restating the corrected percentage — that number is already in the label the
 * tooltip hangs off, so `PassMinusAllNA` and `totalMinusAllErrorMinusAllNA` are
 * no longer spelled out here.
 */
const correctedRateBreakdown = computed(() => {
  const cell = overall.value;
  return [
    `Not-applicable passed checks, due to empty tables or fields: ${formatNumber(
      cell.allNa,
    )} of ${formatNumber(cell.pass)}`,
    `Failed checks due to SQL errors: ${formatNumber(cell.allError)} of ${formatNumber(
      cell.fail,
    )}`,
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
          <DqTooltip
            title="How the pass rate is calculated"
            align="center"
            :width="370"
          >
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
            <p>
              The corrected pass rate excludes SQL errors and not-applicable checks from
              the total.
            </p>
            <p>
              <strong>
                Corrected rate = (Pass − Not Applicable) ÷ (Total − SQL Errors − Not
                Applicable) × 100.
              </strong>
            </p>
            <hr />
            <ul>
              <li v-for="note in correctedRateBreakdown" :key="note">{{ note }}</li>
            </ul>
          </DqTooltip>
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
          <DqTooltip :title="category.label" :lead="category.lead">
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
            <p>{{ category.detail }}</p>
          </DqTooltip>
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

/* Tooltip typography and paragraph rhythm now live in DqTooltip, which has to
   own them: its content is teleported into Vuetify's overlay container, where a
   scoped rule from this file would still match but the tokens would not. */
</style>
