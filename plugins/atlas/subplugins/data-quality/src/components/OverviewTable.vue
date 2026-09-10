<script setup lang="ts">
/**
 * The Verification / Validation / Total x Pass / Fail / Total / %Pass matrix,
 * Figma node 1747:229909. The row build below is a port of transformData() in
 * plugins/ui/apps/portal/src/components/DQD/Overview/OverviewTable/OverviewTable.tsx,
 * so both surfaces show the same twelve cells per category in the same order.
 *
 * A real <table> with rowspan/colspan rather than the design's nested flex rows:
 * the spanning header is what the markup means, and `table-layout: fixed` keeps
 * the body columns aligned with it without repeating widths.
 */
import { computed } from 'vue';
import type { OverviewResults } from '../api/dqd';
import { formatNumber, formatPercent } from '../utils/format';

const props = defineProps<{ data: OverviewResults }>();

const CONTEXTS = [
  { key: 'verification', label: 'Verification' },
  { key: 'validation', label: 'Validation' },
  { key: 'total', label: 'Total' },
] as const;

const MEASURES = ['Pass', 'Fail', 'Total', '%Pass'] as const;

const CATEGORIES = [
  { key: 'plausibility', label: 'Plausibility' },
  { key: 'conformance', label: 'Conformance' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'total', label: 'Total' },
] as const;

const rows = computed(() =>
  CATEGORIES.map(({ key, label }, index) => ({
    key,
    label,
    isTotal: key === 'total',
    // The design darkens the rule above the Total row to set it apart.
    isBeforeTotal: index === CATEGORIES.length - 2,
    cells: CONTEXTS.flatMap(({ key: context }) => {
      const cell = props.data[context][key];
      return [
        formatNumber(cell.pass),
        formatNumber(cell.fail),
        formatNumber(cell.total),
        formatPercent(cell.percentPass),
      ];
    }),
  })),
);
</script>

<template>
  <div class="dq-matrix-scroll">
    <table class="dq-matrix" data-testid="dq-overview-matrix">
      <colgroup>
        <col class="dq-matrix__label-col" />
        <col v-for="index in CONTEXTS.length * MEASURES.length" :key="index" />
      </colgroup>
      <thead>
        <tr>
          <td class="dq-matrix__corner" rowspan="2"></td>
          <th
            v-for="context in CONTEXTS"
            :key="context.key"
            class="dq-matrix__group"
            :colspan="MEASURES.length"
            scope="colgroup"
          >
            {{ context.label }}
          </th>
        </tr>
        <tr>
          <template v-for="context in CONTEXTS" :key="context.key">
            <th
              v-for="measure in MEASURES"
              :key="`${context.key}-${measure}`"
              class="dq-matrix__measure"
              scope="col"
            >
              {{ measure }}
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.key"
          class="dq-matrix__row"
          :class="{
            'dq-matrix__row--total': row.isTotal,
            'dq-matrix__row--before-total': row.isBeforeTotal,
          }"
        >
          <th class="dq-matrix__category" scope="row">{{ row.label }}</th>
          <td
            v-for="(cell, index) in row.cells"
            :key="index"
            class="dq-matrix__cell"
            :class="{ 'dq-matrix__cell--emphasis': index === row.cells.length - 1 }"
          >
            {{ cell }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* The matrix needs ~1000px to stay readable; let it scroll inside the card
   instead of squeezing thirteen columns into a narrow surface. */
.dq-matrix-scroll {
  overflow-x: auto;
  border-radius: var(--dq-radius-xs);
  background: var(--dq-surface);
}

.dq-matrix {
  width: 100%;
  min-width: 1000px;
  border-collapse: collapse;
  table-layout: fixed;
  font-family: var(--dq-font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--dq-text);
}

.dq-matrix__label-col {
  width: 180px;
}

.dq-matrix__corner,
.dq-matrix__group,
.dq-matrix__measure {
  background: var(--dq-surface-subtle);
}

.dq-matrix__corner {
  border-right: 1px solid var(--dq-border);
}

.dq-matrix__group,
.dq-matrix__measure {
  height: 44px;
  padding: 0 var(--dq-space-m);
  text-align: center;
  border-right: 1px solid var(--dq-border);
}

.dq-matrix__group {
  font-weight: 600;
  border-bottom: 1px solid var(--dq-border);
}

.dq-matrix__measure {
  font-weight: 400;
  border-bottom: 1px solid var(--dq-border-subtle);
}

/* Only the outer edge of the header loses its rule. */
.dq-matrix__group:last-child,
.dq-matrix__measure:last-child {
  border-right: 0;
}

.dq-matrix__row > * {
  height: 40px;
  border-bottom: 1px solid var(--dq-border-subtle);
}

.dq-matrix__row--before-total > * {
  border-bottom-color: var(--dq-border);
}

.dq-matrix__row--total {
  background: var(--dq-surface-accent);
}

.dq-matrix__category {
  padding: 0 var(--dq-space-s);
  text-align: right;
  font-weight: 600;
  white-space: nowrap;
}

.dq-matrix__cell {
  padding: 0 var(--dq-space-s);
  text-align: center;
}

.dq-matrix__cell--emphasis {
  font-weight: 600;
}
</style>
