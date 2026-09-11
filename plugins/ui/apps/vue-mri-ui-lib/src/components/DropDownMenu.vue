<template>
  <div
    class="dropdownmenu-container"
    v-bind:class="{ 'fixed-right': overflowRight }"
    :data-testid="testId || 'pa-dropdown-menu'"
  >
    <div class="menuWrapper" v-bind:class="{ closed: !opened }" :style="menuWrapperStyle">
      <ul>
        <template v-for="sub in subMenuStub" :key="sub.idx">
          <li v-if="sub.isSeperator" class="menu-item menuSeperator">
            <hr />
          </li>
          <dropDownMenuItem
            v-bind:class="{
              'menu-item': true,
              'hover-select': sub.idx === hoverIndex,
              'hover-open': sub.idx === selectedIndex,
            }"
            v-if="sub.hasSubMenu && !sub.isSeperator"
            :selected="sub.idx === selectedIndex"
            :toggle="sub.toggle"
            :icon="sub.icon"
            :text="sub.text"
            :hasSubMenu="sub.hasSubMenu"
            @hoverEv="handleHover(sub.idx, true)"
            :isTitle="sub.isTitle"
          ></dropDownMenuItem>
          <dropDownMenuItem
            v-bind:class="{ 'menu-item': true, 'hover-select': sub.idx === hoverIndex }"
            v-if="!sub.hasSubMenu && !sub.isSeperator"
            :icon="sub.icon"
            :text="sub.text"
            :selected="sub.selected"
            :disabled="sub.disabled"
            :toggle="sub.toggle"
            @clickEv="clickEvent(sub.data)"
            @hoverEv="handleHover(sub.idx, false)"
            :isTitle="sub.isTitle"
          >
            <slot name="item" :item="sub">{{ sub.text }}</slot>
          </dropDownMenuItem>
        </template>
      </ul>
    </div>
    <dropDownMenu
      :target="hoverMenuItem"
      :boundariesElement="boundariesElement"
      placement="right-end"
      :parentContainer="parentContainer"
      v-if="selectedSubMenu.hasSubMenu"
      :openParam="subMenuOpenParam"
      :subMenu="selectedSubMenu.subMenu"
      :opened="selectedSubMenu.opened"
      @clickEv="clickEvent"
      @closeEv="closeSubMenu"
    ></dropDownMenu>
  </div>
</template>

<script lang="ts">
import PopperUtils from '../utils/PopperUtils'
import DropDownMenuItem from './DropDownMenuItem.vue'

export default {
  name: 'dropDownMenu',
  props: [
    'subMenu',
    'opened',
    'clickEv',
    'closeEv',
    'openParam',
    'parentContainer',
    'target', // type: node element
    'placement', // type: string
    'boundariesElement', // type: string
    'testId',
  ],
  data() {
    return {
      selectedSubMenu: {
        hasSubMenu: false,
        subMenu: [],
        opened: false,
      },
      overflowRight: false,
      hoverIndex: -1,
      deepestMenu: true,
      selectedIndex: -1,
      subMenuOpenParam: '',
      menuWrapperStyle: {},
      popper: null,
      boundariesHeight: 0,
    }
  },
  watch: {
    subMenu() {
      this.selectedSubMenu.opened = false
      this.deepestMenu = true
    },
    opened() {
      if (!this.opened) {
        this.selectedSubMenu.opened = false
        this.deepestMenu = true
      } else {
        this.overflowRight = false
        this.$nextTick(this.adjustRight)
      }
    },
    openParam(val) {
      if (val === 'clear') {
        this.hoverIndex = -1
        this.selectedIndex = -1
      } else if (val === 'firstItem') {
        this.hoverIndex = 0
        this.hoverNextItem(1)
        this.selectedIndex = -1
      }
    },
  },
  mounted() {
    window.addEventListener('keydown', this.keyboardNavigation)

    this.boundariesHeight = PopperUtils.getMaxHeight(this.boundariesElement)
    this.menuWrapperStyle = {
      position: 'relative',
      'max-height': `${this.boundariesHeight}px`,
      'overflow-y': 'auto',
    }
  },
  updated() {
    if (this.target && this.target.nodeType) {
      if (!this.popper) {
        const popperOpts = this.getPopperOpts()
        this.popper = PopperUtils.create(this.target, this.$el, popperOpts)
      } else {
        this.popper.reference = this.target
        this.popper.update() // Need this for Safari
      }
      this.popper.scheduleUpdate()
    }
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.keyboardNavigation)
    PopperUtils.destroy(this.popper)
  },
  computed: {
    subMenuStub() {
      return this.subMenu
    },
    hoverMenuItem() {
      const menuItems = this.$el.getElementsByClassName('menu-item')
      if (menuItems && menuItems.length > 0) {
        return menuItems[this.hoverIndex]
      }
      return null
    },
  },
  methods: {
    getContainerWidth() {
      try {
        // return this.parentContainer ? parseFloat(window.getComputedStyle(this.parentContainer).width) : window.innerWidth;
        // return this.parentContainer ? this.parentContainer.getBoundingClientRect().width : window.innerWidth;
        return this.parentContainer ? this.parentContainer.offsetWidth : window.innerWidth
      } catch (err) {
        return window.innerWidth
      }
    },
    getContainerHeight() {
      try {
        // return this.parentContainer ? parseFloat(window.getComputedStyle(this.parentContainer).height) : window.innerHeight;
        // return this.parentContainer ? this.parentContainer.getBoundingClientRect().height : window.innerHeight;
        return this.parentContainer ? this.parentContainer.offsetHeight : window.innerHeight
      } catch (err) {
        return window.innerHeight
      }
    },
    adjustRight() {
      this.overflowRight = this.$el.getBoundingClientRect().right > this.getContainerWidth()
    },
    handleHover(idx, hasSubMenu) {
      this.hoverIndex = idx
      if (hasSubMenu) {
        this.openSubmenu(idx)
      } else {
        this.closeSubMenu()
      }
    },
    keyboardNavigation(event) {
      if (this.opened && this.deepestMenu) {
        const evt = event || window.event
        const code = evt.which ? evt.which : evt.keyCode

        if (this.subMenu.length > 0) {
          if (code === 39) {
            // Right
            if (this.hoverIndex === -1) {
              this.hoverIndex = 0
            }
            this.hoverNextItem(1)
            if (this.subMenu[this.hoverIndex].hasSubMenu) {
              this.openSubmenu(this.hoverIndex)
              this.$nextTick(() => {
                this.subMenuOpenParam = 'firstItem'
              })
            }
            evt.preventDefault()
          } else if (code === 37 || code === 27) {
            // Left or Esc Key Button
            this.$emit('closeEv')
            evt.preventDefault()
          } else if (code === 40) {
            // Up Key Button
            if (this.hoverIndex === -1) {
              this.hoverIndex = 0
            } else {
              this.hoverIndex += 1
            }
            this.hoverNextItem(1)
            this.selectedIndex = -1
          } else if (code === 38) {
            // Bottom Key Button
            if (this.hoverIndex === -1) {
              this.hoverIndex = 0
            } else {
              this.hoverIndex -= 1
            }
            this.hoverNextItem(-1)
            this.selectedIndex = -1
          } else if (code === 13) {
            if (this.hoverIndex > -1) {
              if (this.subMenuStub[this.hoverIndex].hasSubMenu) {
                this.openSubmenu(this.hoverIndex)
                this.$nextTick(() => {
                  this.subMenuOpenParam = 'firstItem'
                })
              } else {
                this.clickEvent(this.subMenuStub[this.hoverIndex].data)
              }
            }
          }
          evt.preventDefault()
        }
      }
    },
    clickEvent(arg) {
      this.selectedSubMenu.opened = false
      this.$emit('clickEv', arg)
    },
    closeSubMenu() {
      this.subMenuOpenParam = 'clear'
      this.selectedSubMenu = {
        hasSubMenu: false,
        subMenu: [],
        opened: false,
      }
      this.selectedIndex = -1
      this.deepestMenu = true
    },
    hoverNextItem(increment) {
      if (this.subMenu.length > 0) {
        if (this.hoverIndex >= this.subMenu.length) {
          this.hoverIndex = 0
        }
        if (this.hoverIndex < 0) {
          this.hoverIndex = this.subMenu.length - 1
        }
        while (
          this.subMenu[this.hoverIndex].isSeperator ||
          (this.subMenu[this.hoverIndex].isTitle && !this.subMenu[this.hoverIndex].hasSubMenu)
        ) {
          this.hoverIndex += increment === 0 ? 1 : increment
          if (this.hoverIndex >= this.subMenu.length) {
            this.hoverIndex = 0
          }
          if (this.hoverIndex < 0) {
            this.hoverIndex = this.subMenu.length - 1
          }
        }
      }
    },
    openSubmenu(index) {
      for (let i = 0; i < this.subMenu.length; i += 1) {
        if (i === index) {
          const subMenuObj = { ...this.subMenu[i] }
          this.selectedSubMenu = subMenuObj
          if (this.subMenu[i].hasSubMenu) {
            this.selectedSubMenu.opened = true
            this.deepestMenu = false
          } else {
            this.selectedSubMenu.opened = false
            this.deepestMenu = true
          }
        }
      }
      this.selectedIndex = index
    },
    getPopperOpts() {
      let boundariesElement: any = document.getElementsByClassName(
        this.boundariesElement || PopperUtils.defaultBoundaries
      )
      if (boundariesElement && boundariesElement.length > 0) {
        boundariesElement = boundariesElement[0]
      }

      return {
        placement: this.placement || 'bottom-start',
        modifiers: {
          preventOverflow: {
            boundariesElement: boundariesElement || 'scrollParent',
          },
        },
      }
    },
  },
  components: {
    DropDownMenuItem,
  },
}
</script>
