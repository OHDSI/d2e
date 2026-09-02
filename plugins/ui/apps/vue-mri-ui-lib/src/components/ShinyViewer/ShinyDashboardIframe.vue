<template>
  <div class="shiny-iframe-wrapper">
    <div v-if="loading" class="iframe-loading">
      <div class="spinner"></div>
      <p>{{ getText('MRI_PA_LOADING_DASHBOARD') }}</p>
    </div>

    <div v-if="error" class="iframe-error">
      <span class="error-icon">⚠️</span>
      <p>{{ error }}</p>
    </div>

    <iframe
      v-show="!loading && !error"
      ref="iframeRef"
      :key="iframeUrl"
      :src="iframeUrl"
      class="shiny-iframe"
      frameborder="0"
      @load="handleIframeLoad"
    ></iframe>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useStore } from 'vuex'
import { usePortalContext } from '@/composables/usePortalContext'
import { buildShinyDashboardAuthMessage, buildShinyDashboardIframeUrl } from '@/utils/shinyDashboardContext'

const props = defineProps<{
  datasetId: string
  cohortId: string
  wizardConfig?: Record<string, any>
  mriquery?: string
}>()

const store = useStore()
const getText = (key: string, param?: string | string[]) => store.getters.getText(key, param)

const iframeRef = ref<HTMLIFrameElement | null>(null)
const bearerToken = ref<string>('')
const isIframeReady = ref(false)
const tokenSent = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)

const portalContext = usePortalContext()

const iframeUrl = computed(() => {
  return buildShinyDashboardIframeUrl(props.datasetId, props.wizardConfig)
})

// Watch for wizardConfig changes and reset state when it changes
watch(
  () => props.wizardConfig,
  (newConfig, oldConfig) => {
    if (newConfig !== oldConfig) {
      // Reset state for new dashboard
      isIframeReady.value = false
      tokenSent.value = false
      loading.value = true
      error.value = null
    }
  },
  { deep: true }
)

window.addEventListener('message', handleIframeMessage)

onMounted(async () => {
  await fetchAuthToken()
})

onUnmounted(() => {
  window.removeEventListener('message', handleIframeMessage)
})

async function fetchAuthToken() {
  try {
    const token = await portalContext.getToken()
    if (token) {
      bearerToken.value = token
    } else {
      error.value = 'Failed to retrieve authentication token'
    }
  } catch (err) {
    console.error('Error fetching auth token:', err)
    error.value = 'Authentication failed'
  }
}

function handleIframeMessage(event: MessageEvent) {
  const iframeOrigin = getIframeOrigin()

  if (event.origin !== iframeOrigin) {
    console.warn('[Parent] ⚠️ REJECTED - Origin mismatch:', event.origin, 'Expected:', iframeOrigin)
    return
  }

  const data = event.data

  if (data.type === 'SHINYLIVE_READY') {
    if (!tokenSent.value && bearerToken.value) {
      isIframeReady.value = true
      loading.value = false
      sendTokenToIframe(event.source)
    } else if (!bearerToken.value) {
      isIframeReady.value = true
      loading.value = false
    }
  }

  if (data.type === 'AUTH_READY') {
    tokenSent.value = true
  }

  if (data.type === 'SHINYLIVE_ERROR') {
    console.error('[Parent] ShinyLive error:', data.message)
    error.value = data.message || 'An error occurred in the dashboard'
    loading.value = false
  }
}

function getIframeOrigin(): string {
  if (iframeRef.value?.src) {
    try {
      const url = new URL(iframeRef.value.src, window.location.origin)
      return url.origin
    } catch (e) {
      console.warn('Could not parse iframe origin, using current origin')
    }
  }
  return window.location.origin
}

function sendTokenToIframe(source?: MessageEventSource) {
  if (!iframeRef.value?.contentWindow || !bearerToken.value) {
    console.warn('[Parent] Cannot send token: iframe or token not available')
    return
  }

  try {
    const message = buildShinyDashboardAuthMessage({
      token: bearerToken.value,
      datasetId: props.datasetId,
      cohortId: props.cohortId,
      wizardConfig: props.wizardConfig,
      mriquery: props.mriquery,
    })
    source?.postMessage(message)
  } catch (err) {
    console.error('[Parent] Error sending message to iframe:', err)
    error.value = 'Failed to authenticate with dashboard'
  }
}

function handleIframeLoad() {
  setTimeout(() => {
    if (!isIframeReady.value) {
      console.warn('ShinyLive app did not send ready signal, proceeding anyway')
      isIframeReady.value = true
      loading.value = false
    }
  }, 5000)
}
</script>

<style scoped>
.shiny-iframe-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--color-white, #ffffff);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.shiny-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.iframe-loading,
.iframe-error {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-white, #ffffff);
  z-index: 1;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--color-ui-light-border, #dddddd);
  border-top-color: var(--d2e-color-primary, #000080);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.iframe-loading p {
  margin-top: 16px;
  font-size: 16px;
  color: var(--color-neutral, #595757);
}

.iframe-error {
  text-align: center;
  padding: 40px;
}

.error-icon {
  font-size: 64px;
  margin-bottom: 16px;
  display: block;
}

.iframe-error p {
  font-size: 16px;
  color: var(--color-feedback-error, #a3293d);
  margin: 0;
}
</style>
