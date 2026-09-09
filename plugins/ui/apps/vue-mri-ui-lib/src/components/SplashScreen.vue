<template>
  <!-- role="status" and aria-live: the overlay variant covers an app that is
       already on screen, so a screen reader is given no other sign that
       anything is happening. The label carries the same information the
       spinner does visually. -->
  <div
    class="splash-container"
    :class="{ 'splash-container--overlay': overlay }"
    role="status"
    aria-live="polite"
    :aria-label="loadingLabel"
  >
    <div class="loadingDialog">
      <d4l-spinner />
    </div>
  </div>
</template>

<script lang="ts">
import { mapGetters } from 'vuex'

export default {
  name: 'splashScreen',
  props: {
    overlay: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      splashDisplay: false,
    }
  },
  computed: {
    ...mapGetters(['getText']),
    loadingLabel() {
      return this.getText('MRI_PA_LOADING')
    },
  },
}
</script>

<style scoped lang="scss">
.splash-container {
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9 !important;
  background: #ffffff;
  height: 100%;

  .loadingDialog {
    z-index: 10;
  }
}

/**
 * The overlay variant covers an application that is already on screen — a data
 * source switch, not a first load.
 *
 * It used to paint solid white at full opacity, which is indistinguishable
 * from the first-load splash: the whole application looked like it was booting
 * again. A translucent sheet reads as "busy" while leaving the app visible
 * underneath, and it still swallows clicks, so nothing can be interacted with
 * part way through a switch.
 */
.splash-container--overlay {
  position: absolute;
  inset: 0;
  // Composed from the token rather than a bare literal. There is no scrim
  // token yet; add one to the design system if a second overlay needs it.
  background: color-mix(in srgb, var(--d2e-color-white) 70%, transparent);
  opacity: 1 !important;
}
</style>
