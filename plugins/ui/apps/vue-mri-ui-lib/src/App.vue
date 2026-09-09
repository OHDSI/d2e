<template>
  <div id="app" class="mri-app-vue-container" data-testid="pa-app-container">
    <NotificationStack />
    <SplashScreen v-if="showSplashScreen" :overlay="!getInitialLoad" />
    <!-- `inert` while the reload overlay is up. The app stays in the DOM and
         stays focusable, so Tab could otherwise reach controls that are
         visually covered and about to be replaced — a translucent overlay
         stops the mouse and nothing else. The data source switch is the case
         that matters: it clears the active bookmark and the bookmark list
         underneath.
         Set on the component rather than a wrapper: PatientAnalytics has a
         single root and no `inheritAttrs: false`, so this falls through onto
         it, and a wrapper div would have broken the height chain the splitter
         depends on. `undefined` rather than `false` keeps the attribute
         absent instead of present-and-empty. -->
    <patientanalytics v-show="!getInitialLoad" :inert="getDatasetReloadInProgress || undefined" />
    <UnsavedChangesDialog
      v-model="showUnsavedDialog"
      @leave="unsavedChanges.confirmLeave"
      @stay="unsavedChanges.cancelLeave"
    />
  </div>
</template>

<script setup lang="ts">
// Self-hosted IBM Plex Sans webfont. Imported here (the root component rendered
// by both the standalone and single-spa entries) so it loads in every context.
import '@fontsource-variable/ibm-plex-sans'
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import patientanalytics from './components/PatientAnalytics.vue'
import SplashScreen from './components/SplashScreen.vue'
import NotificationStack from './components/NotificationStack.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'
import { useDeepLink } from './composables/useDeepLink'
import { useUnsavedChanges } from './composables/useUnsavedChanges'
import { usePortalContext } from './composables/usePortalContext'
import CohortUrlCodec from './utils/CohortUrlCodec'

const store = useStore()
const unsavedChanges = useUnsavedChanges()

usePortalContext()

const getInitialLoad = computed<boolean>(() => store.getters.getInitialLoad)
const getDatasetReloadInProgress = computed<boolean>(() => store.getters.getDatasetReloadInProgress)
const showSplashScreen = computed<boolean>(() => getInitialLoad.value || getDatasetReloadInProgress.value)
const showUnsavedDialog = computed<boolean>({
  get: () => unsavedChanges.showDialog.value,
  set: value => {
    unsavedChanges.showDialog.value = value
  },
})

const bindShareCohortDefinition = (): void => {
  ;(window as unknown as { shareCohortDefinition?: () => unknown }).shareCohortDefinition = () =>
    CohortUrlCodec.shareCohortDefinition(store)
  if (process.env.NODE_ENV === 'development') {
    console.log(
      'Deep link utility loaded. Use window.shareCohortDefinition() to generate a shareable URL for the current cohort definition.'
    )
  }
}

const processDeepLinkIfPresent = async (): Promise<void> => {
  try {
    await store.dispatch('requestMriConfig')
    const { processDeepLink } = useDeepLink(store.dispatch, { guard: unsavedChanges.guard })
    await processDeepLink()
  } catch (error) {
    console.error('[App] Failed to load config or process deep link', error)
  }
}

store.dispatch('setDataset')
store.dispatch('setDatasetReleaseId')

onMounted(() => {
  store.dispatch('setLocale')
  bindShareCohortDefinition()
  void processDeepLinkIfPresent()
  unsavedChanges.install()
})

onBeforeUnmount(() => {
  // Vuex modules use object (not factory) state, so the bookmark module's state
  // is shared across the per-mount store instances and survives unmount. Clear
  // the active bookmark (and its baseline) when PA unloads so a stale tab/dirty
  // state does not reappear when the user navigates back.
  store.commit('SET_ACTIVE_BOOKMARK', null)
  unsavedChanges.uninstall()
  unsavedChanges.showDialog.value = false
  unsavedChanges.pendingAction.value = null
})
</script>
<style lang="scss" src="./styles/style.scss"></style>
