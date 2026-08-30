<script setup lang="ts">
/**
 * The design system's tooltip: a white card with a caret pointing back at its
 * trigger, an optional navy heading, an optional lead line and a body. Two
 * placements are drawn in Figma and both are here:
 *
 *   align="end"     Figma 1773:370246 — the category explanations. The card's
 *                   right edge lands on the trigger's, and the caret is a 24px
 *                   box flush right whose 12px triangle sits inset from the
 *                   corner, under the icon.
 *   align="center"  Figma 1773:370270 — the pass-rate calculation. The card is
 *                   centred on the trigger and the caret is a bare 12px triangle
 *                   at its middle.
 *
 * Each caret is its own Figma export rather than one scaled to fit the other:
 * the two differ in box width, not just position.
 *
 * It wraps AtlasTooltip rather than replacing it — AtlasTooltip is a passthrough
 * to Vuetify's VTooltip, so the activator slot, the open/close behaviour and the
 * positioning are all the host's. Only the chrome is ours: Vuetify's own tooltip
 * is a dark, auto-width pill, which the `.dq-tooltip` rules below strip back to a
 * bare positioned box so the caret and the card can be drawn inside it.
 * `offset="0"` closes Vuetify's default 10px gap so the caret touches the trigger
 * the way it does in Figma.
 *
 * The body slot is styled by element, not by class, so callers pass plain
 * `<p>`/`<ul>`/`<hr>` and this component owns how they look — which it has to,
 * since its content is teleported out to where a caller's scoped rules would
 * match but the `--dq-*` tokens would not resolve.
 */
import { computed } from 'vue';
import { AtlasTooltip } from '@ohdsi/atlas-ui';

const props = withDefaults(
  defineProps<{
    /** Heading line, in the brand navy. */
    title?: string;
    /** The one-line question under the heading, separated from the body below. */
    lead?: string;
    /** Which edge of the card the trigger sits under. */
    align?: 'end' | 'center';
    /** Card width in px: 300 for the category cards, 370 for the wider one. */
    width?: number;
    /**
     * Let the pointer into the card — VTooltip's own prop, which drops the
     * `pointer-events: none` it otherwise puts on the content. On by default:
     * every card here holds a paragraph or two meant to be read, and a card that
     * vanishes the moment you move toward it cannot be. `offset="0"` already
     * butts the caret against the trigger, so the trip across is continuous and
     * needs no close delay to survive a gap.
     *
     * Pass `:interactive="false"` where the card would rather not take the
     * pointer — it covers whatever is beneath it while open, so clicks meant for
     * that content land on the card instead.
     */
    interactive?: boolean;
  }>(),
  { align: 'end', width: 300, interactive: true },
);

const location = computed(() => (props.align === 'center' ? 'bottom' : 'bottom end'));
</script>

<template>
  <AtlasTooltip
    :location="location"
    :width="width"
    :interactive="interactive"
    :offset="0"
    :content-class="`dq-tooltip dq-tooltip--${align}`"
  >
    <template #activator="activator">
      <slot name="activator" v-bind="activator" />
    </template>

    <!-- A 12px triangle centred in a 24px box, so it lands inset from the
         card's right corner rather than on it. -->
    <svg
      v-if="align === 'end'"
      class="dq-tooltip__caret"
      width="24"
      height="6"
      viewBox="0 0 24 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 0L18 6H6L12 0Z" fill="currentColor" />
    </svg>
    <svg
      v-else
      class="dq-tooltip__caret"
      width="12"
      height="6"
      viewBox="0 0 12 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M6 0L12 6H0L6 0Z" fill="currentColor" />
    </svg>

    <div class="dq-tooltip__card">
      <p v-if="title" class="dq-tooltip__title">{{ title }}</p>
      <p v-if="lead" class="dq-tooltip__lead">{{ lead }}</p>
      <div class="dq-tooltip__body"><slot /></div>
    </div>
  </AtlasTooltip>
</template>

<!-- Unscoped on purpose. `content-class` lands on Vuetify's own overlay element,
     which never carries this component's scope id, and the whole subtree is
     teleported into `.v-overlay-container` outside `.dq-root`. Every selector is
     `.dq-tooltip`-prefixed so nothing here can reach the Atlas host; the tokens
     follow the class into the overlay via the selector list in style.css. -->
<style>
/* Beats Vuetify's `.v-tooltip > .v-overlay__content`, which would otherwise
   supply a dark background and a pill padding. The width comes from VTooltip's
   own `width` prop, as an inline style. */
.v-tooltip > .v-overlay__content.dq-tooltip {
  display: flex;
  flex-direction: column;
  /* Never wider than the viewport on a narrow window, where the designed width
     would push the card off-screen. */
  max-width: calc(100vw - 2 * var(--dq-space-s));
  padding: 0;
  border-radius: 0;
  background: transparent;
  /* On the flex parent rather than the card, so the caret is part of the same
     silhouette instead of casting a second shadow of its own. */
  filter: drop-shadow(0 0 10px rgb(0 0 0 / 22%));
  font-family: var(--dq-font);
}

.dq-tooltip--end {
  align-items: flex-end;
}

.dq-tooltip--center {
  align-items: center;
}

.dq-tooltip__caret {
  display: block;
  flex: none;
  color: var(--dq-surface);
}

.dq-tooltip__card {
  width: 100%;
  padding: var(--dq-space-xs) var(--dq-space-xs-s);
  border-radius: var(--dq-radius-xs);
  background: var(--dq-surface);
  overflow-wrap: break-word;
}

.dq-tooltip__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--dq-primary);
}

/* Caption 1. The design runs the heading, the lead and the body as consecutive
   lines of one text block, so nothing between them carries a margin. */
.dq-tooltip__lead,
.dq-tooltip__body > p,
.dq-tooltip__body li {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--dq-text-muted);
}

/* The design separates the lead question from the detail with an empty line
   rather than a margin: one 12px/1.5 line, so 18px. */
.dq-tooltip__lead + .dq-tooltip__body {
  margin-top: 18px;
}

.dq-tooltip__body strong {
  font-weight: 700;
}

/* The 8px rhythm the card sets between its stacked blocks, carried by whatever
   separates them. */
.dq-tooltip__body hr {
  height: 1px;
  margin: var(--dq-space-xs) 0;
  border: 0;
  background: var(--dq-border);
}

.dq-tooltip__body ul {
  margin: 0;
  /* Figma indents the list items by 18px and hangs the bullets outside that. */
  padding-inline-start: 18px;
  list-style: disc;
}
</style>
