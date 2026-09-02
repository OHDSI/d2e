<script lang="ts">
export default {
  name: 'DropdownMenu',
}
</script>

<script setup lang="ts">
import Popper from '@/components/Popper.vue'

interface Props {
  options?: string[]
  target: HTMLElement
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
})

const emit = defineEmits<{
  select: [option: string]
}>()

const emitOption = (option: string): void => {
  emit('select', option)
}
</script>

<template>
  <Popper :target="target" placement="bottom-start" class="filter-dropdown-menu-popper">
    <template #default="{ hide }">
      <div class="popover-content">
        <div class="filter-dropdown-menu" @click.stop>
          <div
            class="filter-dropdown-item"
            v-for="option in props.options"
            :key="option"
            @click="
              () => {
                emitOption(option)
                hide()
              }
            "
          >
            {{ option }}
          </div>
        </div>
      </div>
    </template>
  </Popper>
</template>

<style>
.filter-dropdown-menu-popper {
  z-index: 1000;
}
.filter-dropdown-menu {
  background: white;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
}

.filter-dropdown-item {
  padding: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--d2e-color-primary, #000080);
  display: flex;
  align-items: center;
  justify-content: center;
}

.filter-dropdown-item:last-child {
  border-bottom: none;
}

.filter-dropdown-item:hover {
  background-color: #cccfe5;
}
</style>
