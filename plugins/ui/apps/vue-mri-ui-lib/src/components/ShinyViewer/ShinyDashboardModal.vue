<template>
  <transition name="modal-fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
      <div class="modal-container">
        <div class="modal-title">
          <div class="modal-title-text">Dashboard</div>
          <button class="modal-close-btn" @click="handleClose" :title="'Close'">
            <span class="icon" style="font-family: app-icons">&#x2715;</span>
          </button>
        </div>

        <div class="iframe-container">
          <ShinyDashboardIframe
            :dataset-id="datasetId"
            :cohort-id="cohortId"
            :wizard-config="wizardConfig"
            :mriquery="mriquery"
          />
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts" setup>
import ShinyDashboardIframe from './ShinyDashboardIframe.vue'

const props = defineProps<{
  isOpen: boolean
  datasetId: string
  cohortId: string
  wizardConfig?: Record<string, any>
  mriquery?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-container {
  position: relative;
  background: var(--color-ui-extra-light-bg, #f9f9f9);
  width: 100%;
  height: 100%;
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-title {
  display: flex;
  align-items: center;
  margin: 15px 25px;
  gap: 16px;
}

.modal-title-text {
  flex: 1;
  font-size: 18px;
  font-weight: bold;
  color: var(--d2e-color-primary, #000080);
}

.modal-close-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--d2e-color-primary, #000080);
  transition: all 0.2s;
  flex-shrink: 0;
}

.modal-close-btn:hover {
  background: var(--color-neutral-lightest, #f2f0f1);
  color: var(--color-ui-darkest-text, #1f425a);
  transform: scale(1.05);
}

.iframe-container {
  flex: 1;
  padding: 1em;
  display: flex;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .modal-container {
  animation: modal-slide-in 0.3s ease;
}

.modal-fade-leave-active .modal-container {
  animation: modal-slide-out 0.3s ease;
}

@keyframes modal-slide-in {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes modal-slide-out {
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(0.95);
    opacity: 0;
  }
}
</style>
