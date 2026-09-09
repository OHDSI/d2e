<template>
  <div class="splash-container" :class="{ 'splash-container--overlay': overlay }">
    <div class="loadingDialog">
      <d4l-spinner />
    </div>
  </div>
</template>

<script lang="ts">
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
  background: rgb(255 255 255 / 70%);
  opacity: 1 !important;
}
</style>
