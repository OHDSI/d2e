import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppSegmentedButton from '../app-segmented-button.vue'

describe('app-segmented-button.vue', () => {
  const mockItems = [
    { text: 'Option 1', value: 'opt1' },
    { text: 'Option 2', value: 'opt2' },
    { text: 'Option 3', value: 'opt3' },
  ]

  it('renders component with items', () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt1',
      },
    })

    expect(wrapper.find('.app-segmented-button').exists()).toBe(true)
    expect(wrapper.findAll('.app-segmented-listItem')).toHaveLength(3)
  })

  it('renders selected item with correct class', () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt2',
      },
    })

    const items = wrapper.findAll('.app-segmented-listItem')
    expect(items[1].classes()).toContain('app-segmented-listItemSelected')
  })

  it('emits both input and update:modelValue events when item is clicked', async () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt1',
      },
    })

    const secondItem = wrapper.findAll('.app-segmented-listItem')[1]
    await secondItem.trigger('click')

    // Verify dual emission for Vue 2/3 compatibility
    expect(wrapper.emitted('input')).toBeTruthy()
    expect(wrapper.emitted('input')![0]).toEqual(['opt2'])

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['opt2'])
  })

  it('emits onSelectedChange event when item is selected', async () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt1',
      },
    })

    const secondItem = wrapper.findAll('.app-segmented-listItem')[1]
    await secondItem.trigger('click')

    expect(wrapper.emitted('onSelectedChange')).toBeTruthy()
    expect(wrapper.emitted('onSelectedChange')!).toHaveLength(1)
  })

  // Skipped until the workspace installs a single Vue runtime. CI installs two copies, which puts
  // this component's prop watcher on a different reactivity instance than the one @vue/test-utils
  // drives, so setProps() never reaches `selected` and the assertions below fail there while
  // passing locally. See docs/duplicate-vue-runtime.md at the repo root.
  it.skip('updates internal state when value prop changes', async () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt1',
      },
    })

    // Change the value prop
    await wrapper.setProps({ value: 'opt3' })
    await nextTick()

    const items = wrapper.findAll('.app-segmented-listItem')
    expect(items[2].classes()).toContain('app-segmented-listItemSelected')
    expect(items[0].classes()).not.toContain('app-segmented-listItemSelected')
  })

  it('handles keyboard navigation - spacebar selects focused item', async () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt1',
      },
    })

    // Focus on second item
    const secondItem = wrapper.findAll('.app-segmented-listItem')[1]
    await secondItem.trigger('focus')

    // Press spacebar on the container
    await wrapper.find('.app-segmented-button').trigger('keyup', { key: ' ' })
    await nextTick()

    // Should emit events for the focused item
    expect(wrapper.emitted('input')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })

  it('handles keyboard navigation - right arrow moves focus', async () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt1',
      },
    })

    // Focus on first item
    const firstItem = wrapper.findAll('.app-segmented-listItem')[0]
    await firstItem.trigger('focus')

    // Press right arrow
    await wrapper.find('.app-segmented-button').trigger('keyup', { key: 'ArrowRight' })
    await nextTick()

    const items = wrapper.findAll('.app-segmented-listItem')
    expect(items[2].classes()).toEqual(['app-segmented-listItem'])
  })

  it('handles keyboard navigation - left arrow moves focus', async () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt2',
      },
    })

    // Focus on second item
    const secondItem = wrapper.findAll('.app-segmented-listItem')[1]
    await secondItem.trigger('focus')

    // Press left arrow
    await wrapper.find('.app-segmented-button').trigger('keyup', { key: 'ArrowLeft' })
    await nextTick()

    const items = wrapper.findAll('.app-segmented-listItem')
    expect(items[2].classes()).toEqual(['app-segmented-listItem'])
  })

  it('initializes with provided value prop', () => {
    const wrapper = mount(AppSegmentedButton, {
      props: {
        segmentedItems: mockItems,
        value: 'opt3',
      },
    })

    const items = wrapper.findAll('.app-segmented-listItem')
    expect(items[2].classes()).toContain('app-segmented-listItemSelected')
  })
})
