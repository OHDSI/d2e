<script setup lang="ts">
import { computed } from 'vue'
import type { RuleFilterCardDetails } from '@/query-filter/types/InclusionReportTypes'
import { getRuleNameParts } from '@/utils/filterCardUtils'

const props = defineProps<{
  stat: { id: number; name: string; isExclude: boolean }
  filterCardDetails?: RuleFilterCardDetails[]
}>()

/** Pairs each non-OR name part with its corresponding FilterCardDetail (if available) */
const nameParts = computed(() => getRuleNameParts(props.stat.name, props.filterCardDetails?.[props.stat.id]))
</script>

<template>
  <span>{{ stat.isExclude ? '-' : '+' }}&nbsp;</span>
  <template v-for="(part, i) in nameParts" :key="i">
    <b v-if="part.isOr"> OR </b>
    <template v-else>
      {{ part.text }}
      <div v-if="part.fc" class="filter-card-details">
        <template v-for="attribute in part.fc.visibleAttributes" :key="attribute.name">
          <div class="bookmark-attribute">
            <span v-if="!part.isBasicData" class="bookmark-element">{{ attribute.name }}: </span>
            <span
              v-for="(constraint, cIdx) in attribute.visibleConstraints"
              :key="cIdx"
              class="bookmark-element bookmark-constraint"
              >{{ constraint }}{{ cIdx < attribute.visibleConstraints.length - 1 ? ', ' : '' }}</span
            >
          </div>
        </template>
        <template v-for="atf in part.fc.visibleAdvanceTime" :key="atf">
          <div class="bookmark-attribute">
            <span class="bookmark-element">{{ atf.replace(/<\/?b>/g, '') }}</span>
          </div>
        </template>
      </div>
    </template>
  </template>
</template>
