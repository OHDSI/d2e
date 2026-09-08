<template>
  <!-- Figma node 2976:388124: a 48px bar under the grid, white with a top
       rule (docs/projects/vue-mri-ui/pr12/01-pagination.md). -->
  <div class="exploration-pagination" data-testid="explorations-pagination">
    <div class="exploration-pagination__left">
      <span class="exploration-pagination__label">{{ getText('MRI_PA_EXPLORATIONS_ROWS_PER_PAGE') }}</span>
      <div class="exploration-pagination__size">
        <select
          class="exploration-pagination__size-input"
          :value="pageSize"
          data-testid="explorations-page-size"
          @change="onPageSizeChange($event)"
        >
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
        <v-icon icon="mdi-menu-down" size="32" class="exploration-pagination__size-arrow" />
      </div>
    </div>

    <div class="exploration-pagination__right">
      <span class="exploration-pagination__count">{{ pageLabel(total, page, pageSize) }}</span>

      <D2eIconButton
        category="no-stroke"
        size="sm"
        :disabled="page <= 1"
        :aria-label="getText('MRI_PA_EXPLORATIONS_PAGE_FIRST')"
        data-testid="explorations-page-first"
        @click="goTo(1)"
      >
        <ExplorationPaginationFirstIcon />
      </D2eIconButton>

      <D2eIconButton
        category="no-stroke"
        size="sm"
        :disabled="page <= 1"
        :aria-label="getText('MRI_PA_EXPLORATIONS_PAGE_PREV')"
        data-testid="explorations-page-prev"
        @click="goTo(page - 1)"
      >
        <ExplorationPaginationPrevIcon />
      </D2eIconButton>

      <D2eIconButton
        category="no-stroke"
        size="sm"
        :disabled="page >= totalPages"
        :aria-label="getText('MRI_PA_EXPLORATIONS_PAGE_NEXT')"
        data-testid="explorations-page-next"
        @click="goTo(page + 1)"
      >
        <ExplorationPaginationNextIcon />
      </D2eIconButton>

      <D2eIconButton
        category="no-stroke"
        size="sm"
        :disabled="page >= totalPages"
        :aria-label="getText('MRI_PA_EXPLORATIONS_PAGE_LAST')"
        data-testid="explorations-page-last"
        @click="goTo(totalPages)"
      >
        <ExplorationPaginationLastIcon />
      </D2eIconButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import { D2eIconButton } from '@d2e/ui'
import { PAGE_SIZES, pageCount, pageLabel } from './helpers/explorationPaging'
import ExplorationPaginationFirstIcon from './icons/ExplorationPaginationFirstIcon.vue'
import ExplorationPaginationPrevIcon from './icons/ExplorationPaginationPrevIcon.vue'
import ExplorationPaginationNextIcon from './icons/ExplorationPaginationNextIcon.vue'
import ExplorationPaginationLastIcon from './icons/ExplorationPaginationLastIcon.vue'

interface Props {
  /** Rows after filter and search, before paging. */
  total: number
  /** 1-based. */
  page: number
  pageSize: number
}

const props = defineProps<Props>()

const emit = defineEmits<{ 'update:page': [value: number]; 'update:pageSize': [value: number] }>()

const store = useStore()

const getText = (key: string): string => {
  const resolver = store.getters.getText
  return typeof resolver === 'function' ? resolver(key) : key
}

const totalPages = computed(() => pageCount(props.total, props.pageSize))

const goTo = (page: number): void => {
  if (page < 1 || page > totalPages.value || page === props.page) return
  emit('update:page', page)
}

// Changing the page size returns to page 1: preserving the offset across a
// size change moves the user somewhere they did not ask to be.
const onPageSizeChange = (event: Event): void => {
  const size = Number((event.target as HTMLSelectElement).value)
  emit('update:pageSize', size)
  emit('update:page', 1)
}
</script>

<style scoped lang="scss">
.exploration-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: var(--d2e-spacing-xs) var(--d2e-spacing-m);
  border-top: 1px solid var(--d2e-color-neutral-lighter);
  background: var(--d2e-color-white);
  font-family: var(--d2e-font-family);

  &__left,
  &__right {
    display: flex;
    align-items: center;
    gap: var(--d2e-spacing-xs);
    flex: 0 0 280px;
  }

  &__right {
    justify-content: flex-end;
  }

  &__label,
  &__count {
    font-size: var(--d2e-font-body2-size);
    font-weight: var(--d2e-font-body2-weight);
    line-height: var(--d2e-font-body2-line-height);
    color: var(--d2e-color-neutral-black);
  }

  &__count {
    text-align: center;
  }

  &__size {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  // A native <select> matches the frame's plain box exactly; D2eSelect's
  // outlined field is 40/48px tall with a floating label, neither of which
  // this control has. `appearance: none` drops the UA's own arrow so only
  // the mdi-menu-down glyph shows.
  &__size-input {
    appearance: none;
    border: 1px solid var(--d2e-color-neutral-light);
    border-radius: var(--d2e-radius-sm);
    padding: 0 32px 0 12px;
    height: 32px;
    font-family: inherit;
    font-size: var(--d2e-font-body2-size);
    color: var(--d2e-color-neutral-black);
    background: var(--d2e-color-white);
  }

  &__size-arrow {
    position: absolute;
    right: 4px;
    pointer-events: none;
    color: var(--d2e-color-neutral);
  }
}
</style>
