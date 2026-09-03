<template>
  <D2eDialog
    :model-value="modelValue"
    :busy="isDeleting"
    :title="getText('MRI_PA_EXPLORATION_DELETE_DIALOG_TITLE')"
    data-testid="pa-modal-wrapper"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="close"
  >
    <p class="delete-dialog-text">{{ getText('MRI_PA_EXPLORATION_DELETE_DIALOG_TEXT') }}</p>
    <template #actions>
      <D2eButton variant="secondary" :disabled="isDeleting" data-testid="pa-save-dialog-cancel-btn" @click="close">
        {{ getText('MRI_PA_BUTTON_CANCEL') }}
      </D2eButton>
      <D2eButton
        variant="danger"
        :disabled="isDeleting"
        v-focus
        data-testid="pa-save-dialog-save-btn"
        @click="confirm"
      >
        {{ getText('MRI_PA_BUTTON_YES_DELETE') }}
      </D2eButton>
    </template>
  </D2eDialog>
</template>

<script lang="ts">
/**
 * The delete confirmation, extracted so the exploration page has a card entry
 * point for #3124. The three-way delete branch is moved verbatim from
 * `Bookmarks.vue`: a materialized cohort, an Atlas cohort definition and a D2E
 * bookmark each take a different endpoint, and there is no batch equivalent.
 */
import { mapActions, mapGetters, mapMutations } from 'vuex'
import { D2eButton, D2eDialog } from '@d2e/ui'
import * as types from '../store/mutation-types'
import { getBookmarkType } from '../utils/BookmarkUtils'

export default {
  name: 'DeleteExplorationDialog',
  components: { D2eDialog, D2eButton },
  props: {
    modelValue: { type: Boolean, default: false },
    bookmarkDisplay: { type: Object, default: null },
  },
  emits: ['update:modelValue', 'deleted'],
  data() {
    return {
      isDeleting: false,
    }
  },
  watch: {
    modelValue(open: boolean) {
      if (open) {
        this.isDeleting = false
      }
    },
  },
  computed: {
    ...mapGetters(['getText', 'getActiveBookmark']),
  },
  methods: {
    ...mapActions([
      'fireBookmarkQuery',
      'fireDeleteMaterializedCohortQuery',
      'fireDeleteAtlasCohortDefinitionQuery',
      'resetChart',
    ]),
    ...mapMutations([types.SET_ACTIVE_BOOKMARK]),
    close() {
      if (this.isDeleting) return
      this.$emit('update:modelValue', false)
    },
    async confirm() {
      if (this.isDeleting) return
      const bookmarkDisplay = this.bookmarkDisplay
      if (!bookmarkDisplay) return

      this.isDeleting = true
      const activeBookmark = this.getActiveBookmark
      const bookmarkType = getBookmarkType(bookmarkDisplay)
      const isMaterializedCohort = bookmarkType === 'M'
      const isD2ECohortDefinition = ['D', 'D+M'].includes(bookmarkType)
      const isAtlasCohortDefinition = ['A', 'A+M'].includes(bookmarkType)

      try {
        if (isMaterializedCohort) {
          await this.fireDeleteMaterializedCohortQuery(bookmarkDisplay.cohortDefinition.id)
        } else if (isAtlasCohortDefinition) {
          await this.fireDeleteAtlasCohortDefinitionQuery(bookmarkDisplay.atlasCohortDefinition.id)
        } else if (isD2ECohortDefinition) {
          await this.fireBookmarkQuery({
            params: { cmd: 'delete' },
            method: 'delete',
            bookmarkId: bookmarkDisplay.bookmark.id,
          })
        }

        await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
        this.$emit('update:modelValue', false)

        if (!isMaterializedCohort && activeBookmark && activeBookmark.bookmarkname === bookmarkDisplay.bookmark?.name) {
          // The deleted record is the one loaded in the builder, so clear it and
          // put the chart back to the config's initial state. resetChart also
          // dispatches resetChartProperties, which clears the axis and display
          // settings the deleted exploration set; doing only setIFRState plus
          // setupChartDefaults leaves those behind.
          this[types.SET_ACTIVE_BOOKMARK](null)
          await this.resetChart()
        }

        this.$emit('deleted')
      } catch (error) {
        console.error('Error deleting bookmark:', error)
      } finally {
        this.isDeleting = false
      }
    },
  },
}
</script>

<style scoped>
.delete-dialog-text {
  margin: 0;
}
</style>
