<script setup lang="ts">
import { ref } from "vue";
import D2eExplorationCard from "./D2eExplorationCard.vue";
import D2eIconButton from "./D2eIconButton.vue";
import D2eButton from "./D2eButton.vue";

const readySelected = ref(false);
const notRunSelected = ref(false);
const staleSelected = ref(false);
const truncatedSelected = ref(true);

const bookmark = [
  { label: "Created by", value: "research123" },
  { label: "Last updated", value: "18 May 2026" },
  { label: "Version", value: 1 },
];

const readyRows = [
  { label: "Last Materialised on", value: "19 May 2026" },
  { label: "Exploration ID", value: 39 },
  { label: "Description", value: "SNRI users" },
];

const notRunRows = [
  { label: "Last Materialised on", value: "-" },
  { label: "Exploration ID", value: "-" },
  { label: "Description", value: "-" },
];

const staleRows = [
  { label: "Last Materialised on", value: "14 May 2026" },
  { label: "Cohort ID", value: 39 },
  { label: "Description", value: "SNRI users" },
];
</script>

<template>
  <Story title="D2eExplorationCard" group="components" responsive-disabled>
    <Variant title="ready">
      <D2eExplorationCard
        v-model:selected="readySelected"
        name="SNRI Users"
        status="ready"
        person-count="223,888,432"
        :metadata="readyRows"
        :bookmark="bookmark"
      >
        <template #toolbar>
          <D2eIconButton
            size="lg"
            icon="mdi-account-multiple-plus-outline"
            aria-label="Materialize"
          />
          <D2eIconButton
            size="lg"
            icon="mdi-medal-outline"
            aria-label="Quality"
          />
          <D2eIconButton
            size="lg"
            icon="mdi-file-document-outline"
            aria-label="Details"
          />
          <D2eIconButton size="lg" icon="mdi-chart-line" aria-label="Analyze" />
          <D2eIconButton size="lg" icon="mdi-dots-vertical" aria-label="More" />
        </template>
      </D2eExplorationCard>
    </Variant>

    <Variant title="not run yet">
      <D2eExplorationCard
        v-model:selected="notRunSelected"
        name="SNRI Users"
        status="not-run"
        :metadata="notRunRows"
        :bookmark="bookmark"
      >
        <template #lead>
          <D2eButton
            variant="secondary"
            size="sm"
            prepend-icon="mdi-account-multiple-plus-outline"
          >
            Materialize
          </D2eButton>
        </template>
        <template #toolbar>
          <D2eIconButton
            size="lg"
            icon="mdi-account-multiple-plus-outline"
            aria-label="Materialize"
          />
          <D2eIconButton
            size="lg"
            icon="mdi-medal-outline"
            aria-label="Quality"
          />
          <D2eIconButton
            size="lg"
            icon="mdi-file-document-outline"
            aria-label="Details"
          />
          <D2eIconButton size="lg" icon="mdi-chart-line" aria-label="Analyze" />
          <D2eIconButton size="lg" icon="mdi-dots-vertical" aria-label="More" />
        </template>
      </D2eExplorationCard>
    </Variant>

    <Variant title="stale">
      <D2eExplorationCard
        v-model:selected="staleSelected"
        name="SNRI Users"
        status="stale"
        person-count="223,888,432"
        :metadata="staleRows"
        :bookmark="[...bookmark.slice(0, 2), { label: 'Version', value: 2 }]"
      >
        <template #toolbar>
          <D2eIconButton
            size="lg"
            icon="mdi-account-multiple-plus-outline"
            aria-label="Materialize"
          />
          <D2eIconButton
            size="lg"
            icon="mdi-medal-outline"
            aria-label="Quality"
          />
          <D2eIconButton
            size="lg"
            icon="mdi-file-document-outline"
            aria-label="Details"
          />
          <D2eIconButton size="lg" icon="mdi-chart-line" aria-label="Analyze" />
          <D2eIconButton size="lg" icon="mdi-dots-vertical" aria-label="More" />
        </template>
      </D2eExplorationCard>
    </Variant>

    <Variant title="truncated name and description">
      <D2eExplorationCard
        v-model:selected="truncatedSelected"
        name="SNRI Users Researcher trial Helsinki cohort 2026"
        status="ready"
        person-count="223,888,432"
        :metadata="[
          { label: 'Last Materialised on', value: '19 May 2026' },
          { label: 'Exploration ID', value: 39 },
          {
            label: 'Description',
            value: 'SNRI Users Researcher trial Helsinki cohort 2026',
          },
        ]"
        :bookmark="bookmark"
      >
        <template #toolbar>
          <D2eIconButton
            size="lg"
            icon="mdi-account-multiple-plus-outline"
            aria-label="Materialize"
          />
          <D2eIconButton size="lg" icon="mdi-dots-vertical" aria-label="More" />
        </template>
      </D2eExplorationCard>
    </Variant>
  </Story>
</template>
