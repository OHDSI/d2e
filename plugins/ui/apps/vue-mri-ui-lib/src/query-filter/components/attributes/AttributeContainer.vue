<script setup lang="ts">
import { computed } from 'vue'
import TrashIcon from '../icons/TrashIcon.vue'
import { QueryFilterAttribute } from '@/query-filter/types/QueryFilterTypes'
import DateInput from './DateInput.vue'
import DateAdjustmentInput from './DateAdjustmentInput.vue'
import UserDefinedPeriodInput from './UserDefinedPeriodInput.vue'
import NumericRangeInput from './NumericRangeInput.vue'
import StringInput from './StringInput.vue'

const componentMap = {
  dateRange: DateInput,
  dateAdjustment: DateAdjustmentInput,
  userDefinedPeriod: UserDefinedPeriodInput,
  numericRange: NumericRangeInput,
  text: StringInput,
}
const props = defineProps<{
  attribute: QueryFilterAttribute
  onRemoveAttribute?: () => void
}>()

const emit = defineEmits<{
  (e: 'update-attribute', attributeId: string, value: any): void
}>()

const isBooleanAttribute = (attribute: QueryFilterAttribute) => {
  return 'configType' in attribute && attribute.configType === 'boolean'
}

const getDescription = (attribute: QueryFilterAttribute) => {
  return ('description' in attribute && attribute.description) || 'No description available'
}

const getUpdate = payload => {
  emit('update-attribute', props.attribute.id, payload)
}

const attributeType = computed(() => {
  const type = 'configType' in props.attribute ? props.attribute.configType : 'text'
  return type
})
</script>

<template>
  <div class="attribute-container">
    <div class="attribute-title" :class="{ 'attribute-title__max-width': !isBooleanAttribute(attribute) }">
      {{ getDescription(props.attribute) }}
    </div>
    <div v-if="!isBooleanAttribute(props.attribute)" class="attribute-input">
      <component
        :is="componentMap[attributeType]"
        @update="getUpdate"
        :value="props.attribute && 'value' in props.attribute && props.attribute.value"
        :operator="props.attribute && 'operator' in props.attribute && props.attribute.operator"
        :extent="props.attribute && 'extent' in props.attribute && props.attribute.extent"
      />
    </div>
    <div class="attribute-btn-container">
      <button
        class="remove-attribute-btn"
        title="Remove this attribute"
        @click="props.onRemoveAttribute && props.onRemoveAttribute()"
      >
        <TrashIcon />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.attribute-container {
  display: flex;
  border-radius: 6px;
  border: 1px solid var(--d2e-color-primary, #000080);

  .attribute-title {
    display: flex;
    padding: 15px;
    flex: 1;
    color: var(--d2e-color-primary, #000080);
    background: #ebf2fa;
    font-size: 15px;
    border-top-left-radius: 6px;
    border-bottom-left-radius: 6px;
    border-right: 1px solid var(--d2e-color-primary, #000080);
    padding: 15px;
    flex: 2;

    &__max-width {
      max-width: 20%;
      align-items: center;
    }
  }

  .attribute-input {
    padding: 5px 15px;
    flex: 2;
    border-right: 1px solid var(--d2e-color-primary, #000080);
    display: flex;
    align-items: center;
    color: var(--d2e-color-primary, #000080);
  }

  .attribute-btn-container {
    display: flex;
    .remove-attribute-btn {
      flex: 1;
      border: 1px solid transparent;
      background: #ebf2fa;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 6px 8px;
      border-top-right-radius: 6px;
      border-bottom-right-radius: 6px;

      &:hover {
        color: var(--d2e-color-primary, #000080);
        background: #f2f0f1;
      }
    }
  }
}
</style>
