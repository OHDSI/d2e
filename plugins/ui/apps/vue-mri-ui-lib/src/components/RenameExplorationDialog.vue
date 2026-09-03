<template>
  <D2eDialog
    :model-value="modelValue"
    :busy="isRenaming"
    :title="getText('MRI_PA_EXPLORATION_RENAME_DIALOG_TITLE')"
    data-testid="pa-modal-wrapper"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="close"
  >
    <D2eTextField
      v-model="renamedBookmark"
      :label="getText('MRI_PA_EXPLORATION_NAME_LABEL')"
      required
      :error-messages="renameErrorMessages"
      :maxlength="maxLength + 1"
      autofocus
      @keydown.enter="confirm"
    />
    <template #actions>
      <D2eButton variant="secondary" :disabled="isRenaming" data-testid="pa-save-dialog-cancel-btn" @click="close">
        {{ getText('MRI_PA_BUTTON_CANCEL') }}
      </D2eButton>
      <D2eButton :disabled="hasExceededLength || isRenaming" data-testid="pa-save-dialog-save-btn" @click="confirm">
        {{ getText('MRI_PA_BUTTON_RENAME') }}
      </D2eButton>
    </template>
  </D2eDialog>
</template>

<script lang="ts">
/**
 * The rename dialog, extracted so the exploration page has a card entry point
 * for #3122. The body and every dispatch are moved verbatim from
 * `Bookmarks.vue`; only the state ownership changes — the target arrives as a
 * prop and the open/close flag is `v-model`.
 */
import { mapActions, mapGetters, mapMutations } from 'vuex'
import { D2eButton, D2eDialog, D2eTextField } from '@d2e/ui'
import * as types from '../store/mutation-types'
import { usePortalContext } from '../composables/usePortalContext'

export default {
  name: 'RenameExplorationDialog',
  components: { D2eDialog, D2eButton, D2eTextField },
  props: {
    modelValue: { type: Boolean, default: false },
    bookmarkDisplay: { type: Object, default: null },
  },
  emits: ['update:modelValue', 'saved'],
  data() {
    return {
      portalContext: usePortalContext(),
      maxLength: 255,
      renamedBookmark: '',
      isRenaming: false,
      cohortNameValidationState: 'valid' as 'invalid' | 'valid' | 'empty',
    }
  },
  watch: {
    modelValue: {
      immediate: true,
      handler(open: boolean) {
        // Seed the field each time the dialog opens, so a cancelled edit does
        // not leak into the next card the user renames.
        if (open) {
          this.renamedBookmark = this.bookmarkDisplay?.displayName || ''
          this.cohortNameValidationState = 'valid'
          this.isRenaming = false
        }
      },
    },
  },
  computed: {
    ...mapGetters(['getText', 'getBookmarks', 'getActiveBookmark']),
    hasExceededLength() {
      return this.renamedBookmark.length > this.maxLength
    },
    renameErrorMessages(): string[] {
      const errors: string[] = []
      if (this.cohortNameValidationState === 'invalid') {
        errors.push(this.getText('MRI_PA_INVALID_NAME_ERROR'))
      }
      if (this.cohortNameValidationState === 'empty') {
        errors.push(this.getText('MRI_PA_BMK_EMPTY_NAME_ERROR'))
      }
      if (this.hasExceededLength) {
        errors.push('Filter name must not exceed 255 characters')
      }
      return errors
    },
  },
  methods: {
    ...mapActions(['fireBookmarkQuery', 'fireRenameMaterializedCohortQuery']),
    ...mapMutations([types.SET_ACTIVE_BOOKMARK, types.SET_ACTIVE_BOOKMARK_BASELINE]),
    isMScohort(bookmarkDisplay) {
      // MS cohort only contains a cohort definition
      return bookmarkDisplay.cohortDefinition && !bookmarkDisplay.bookmark
    },
    close() {
      if (this.isRenaming) return
      this.cohortNameValidationState = 'valid'
      this.$emit('update:modelValue', false)
    },
    async confirm() {
      if (this.hasExceededLength || this.isRenaming) return
      const bookmarkDisplay = this.bookmarkDisplay
      if (!bookmarkDisplay) return

      this.renamedBookmark = this.renamedBookmark.trim()

      if (!this.renamedBookmark.length) {
        this.cohortNameValidationState = 'empty'
        return
      }

      const username = this.portalContext.username
      for (const bookmark of this.getBookmarks) {
        if (
          username === bookmark.user_id &&
          bookmark.bookmarkname.trim() === this.renamedBookmark &&
          bookmark.bmkId !== bookmarkDisplay.bookmark?.id // Exclude the current bookmark
        ) {
          this.cohortNameValidationState = 'invalid'
          return
        }
      }

      this.isRenaming = true

      try {
        if (this.isMScohort(bookmarkDisplay)) {
          await this.fireRenameMaterializedCohortQuery({
            cohortDefinitionId: bookmarkDisplay.cohortDefinition.id,
            newName: this.renamedBookmark,
          })
          await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
          this.cohortNameValidationState = 'valid'
          this.$emit('update:modelValue', false)
          this.$emit('saved')
          return
        }

        const request = { cmd: 'rename', newName: this.renamedBookmark }
        await this.fireBookmarkQuery({
          method: 'put',
          params: request,
          bookmarkId: bookmarkDisplay.bookmark.id,
        })

        const activeBookmark = this.getActiveBookmark
        if (activeBookmark && activeBookmark.bmkId === bookmarkDisplay.bookmark.id) {
          // Rename is metadata-only and must not change dirty state. SET_ACTIVE_BOOKMARK
          // clears activeBookmarkBaseline, so preserve and restore it — keeping the exact
          // dirty semantics (clean stays clean, in-progress edits stay dirty) instead of
          // falling back to the fragile legacy raw-JSON comparison.
          const baseline = this.$store.getters.getActiveBookmarkBaseline
          this[types.SET_ACTIVE_BOOKMARK]({ ...activeBookmark, bookmarkname: request.newName })
          if (baseline != null) {
            this[types.SET_ACTIVE_BOOKMARK_BASELINE](baseline)
          }
        }

        await this.fireBookmarkQuery({ method: 'get', params: { cmd: 'loadAll' } })
        this.cohortNameValidationState = 'valid'
        this.$emit('update:modelValue', false)
        this.$emit('saved')
      } catch (error) {
        console.error('Error renaming bookmark:', error)
      } finally {
        this.isRenaming = false
      }
    },
  },
}
</script>
