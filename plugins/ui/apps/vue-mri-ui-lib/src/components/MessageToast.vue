<template>
  <transition name="fade">
    <!-- The toast is the only confirmation several actions give — duplicating an
         exploration, renaming one, deleting one — and it dismisses itself after
         two seconds. Without a live region a screen reader announces none of
         them, so those actions appear to have done nothing. The failure path
         already announces, through BsAlert's role="alert". -->
    <div class="app-mri-toast" role="status" aria-live="polite" v-if="toastMessage !== ''">
      <span class="app-mri-toast-body">{{ toastMessage }}</span>
    </div>
  </transition>
</template>
<script lang="ts">
import { useNotificationStore } from '../stores/notifications'

export default {
  name: 'messageToast',
  setup() {
    return {
      notificationStore: useNotificationStore(),
    }
  },
  data() {
    return {
      timerToken: null,
    }
  },
  computed: {
    toastMessage() {
      return this.notificationStore.toast.message
    },
  },
  watch: {
    toastMessage(newMessage: string) {
      if (!newMessage) {
        clearTimeout(this.timerToken)
        this.timerToken = null
        return
      }
      this.start()
    },
  },
  beforeUnmount() {
    clearTimeout(this.timerToken)
    this.timerToken = null
  },
  methods: {
    start() {
      clearTimeout(this.timerToken)
      this.timerToken = setTimeout(() => {
        this.notificationStore.setToastMessage({ text: '' })
      }, 2000)
    },
  },
}
</script>
<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
