<template>
  <li
    class="dropdownmenuitem-container"
    v-on:mouseover="onItemHover"
    v-on:click="onItemClick"
    v-bind:class="getClass()"
    :role="toggle ? 'menuitemcheckbox' : undefined"
    :aria-checked="toggle ? selected : undefined"
    :aria-disabled="disabled || undefined"
    :data-testid="`pa-axis-dropdown-item-${text}`"
  >
    <div class="leftMargin"></div>
    <div class="content">
      <span
        v-if="toggle"
        class="menu-toggle-switch"
        :class="{ 'menu-toggle-switch--checked': selected, 'menu-toggle-switch--disabled': disabled }"
        aria-hidden="true"
      >
        <span class="menu-toggle-switch__thumb"></span>
      </span>
      <icon v-if="icon !== ''" :icon="icon" />
      <slot>{{ text }}</slot>
    </div>
    <div class="subMenu" v-html="subMenuText"></div>
    <div class="rightMargin"></div>
  </li>
</template>

<script lang="ts">
import icon from '../lib/ui/app-icon.vue'

export default {
  name: 'dropDownMenuItem',
  props: ['text', 'hasSubMenu', 'selected', 'disabled', 'clickEv', 'hoverEv', 'isTitle', 'icon', 'toggle'],
  computed: {
    subMenuText() {
      if (this.hasSubMenu) {
        return '&#xe1ed;'
      }
      return ' '
    },
  },
  methods: {
    onItemHover() {
      this.$emit('hoverEv')
    },
    onItemClick() {
      if (!this.disabled) {
        this.$emit('clickEv')
      }
    },
    getClass() {
      return {
        selected: this.selected,
        hasNoSubMenu: !this.hasSubMenu,
        disabled: this.disabled,
        menuTitle: this.isTitle,
        toggleItem: this.toggle,
        noHover: this.disabled || (this.isTitle && !this.hasSubMenu),
      }
    },
  },
  components: {
    icon,
  },
}
</script>
