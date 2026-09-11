import { shallowMount } from '@vue/test-utils'
import { createStore } from 'vuex'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdvancedTime from '../AdvancedTime.vue'

// The panel renders from a CLONE of the layout, built in data() and remapped in
// mounted() into the { key, text } pairs the dropdowns need. Everything that used to
// change the stored relation went through this component, so cloning once was enough.
// set_time_relation (the AI assistant's temporal patch op) changes it from outside,
// and a cohort can be loaded while the card is already mounted — so the clone has to
// track the store, or the panel shows one relation while the query runs another.
const CARD = 'card1'
const TARGET = 'card2'
const OTHER_TARGET = 'card3'

const storedRelation = (overrides: Record<string, string> = {}) => ({
  originSelection: 'startdate',
  targetSelection: 'after_startdate',
  targetInteraction: TARGET,
  days: '[0-90]',
  ...overrides,
})

const updateFilterCardTimeFilter = vi.fn()

const makeStore = () =>
  createStore({
    actions: { updateFilterCardTimeFilter },
    getters: {
      getText: () => (key: string) => key,
      // One card per container: getList only offers a container that holds exactly
      // one, because a temporal target cannot be an OR-ed alternative.
      getFilterCardsByBoolFilterContainerId:
        () =>
        ({ boolFilterContainerId }) =>
          ({
            container1: [{ key: CARD, text: 'Prescription' }],
            container2: [{ key: TARGET, text: 'Diagnosis' }],
            container3: [{ key: OTHER_TARGET, text: 'Drug Exposure' }],
          })[boolFilterContainerId] ?? [],
      getBoolFilterContainers: () => () => ({
        container1: { props: { filterCards: [CARD] } },
        container2: { props: { filterCards: [TARGET] } },
        container3: { props: { filterCards: [OTHER_TARGET] } },
      }),
    },
  })

// Registered only so Vue can resolve the dropdowns; the assertions read the model
// the template iterates and count the days inputs it renders.
const multiselect = { name: 'multiselect', props: ['modelValue', 'options'], render: () => null }

// Stands in for the Vuex entity the layout really comes from: ADVANCEDTIME_SET_TIMEFILTER
// replaces `timeFilters` on the stored card, and the parent hands the layout holding it
// down as this prop.
const layoutFor = (timeFilters: any[]) => ({
  props: { filterCardId: CARD, timeFilterTitle: '', timeFilterModel: { timeFilters } },
})

const mountPanel = (timeFilters: any[]) => {
  const wrapper = shallowMount(AdvancedTime as any, {
    global: {
      plugins: [makeStore()],
      components: { multiselect },
      // The rows live inside the bs-collapse slot, so the stub has to render it for
      // the days inputs to exist at all.
      renderStubDefaultSlot: true,
    },
    props: {
      advancedTimeLayout: layoutFor(timeFilters),
      parentId: 'container1',
      filterCardId: CARD,
      filterCardName: 'Prescription',
    },
  })

  // What the store moving on its own looks like from in here: the panel is handed the
  // stored relations as they now are, without being remounted. Driving it through
  // setProps keeps the prop update inside the Vue instance that mounted the component
  // — mutating an object the test made reactive itself only tracks in test-utils'
  // install layout, where that instance happens to be the same one.
  const setStored = (next: any[]) => wrapper.setProps({ advancedTimeLayout: layoutFor(next) })

  return { wrapper, setStored }
}

const renderedRows = (wrapper: any) => wrapper.vm.model.props.timeFilterModel.timeFilters
// The days the rows are showing. Read off the model the inputs bind to rather than the
// inputs' DOM value: v-model writes that value through a directive the compiled SFC
// imports from Vue itself, so it silently stops being applied whenever the component's
// Vue is not the one test-utils mounted it with. The input count still tells us the
// rows themselves rendered.
const renderedDays = (wrapper: any) => renderedRows(wrapper).map((row: any) => row.days)
const renderedRowCount = (wrapper: any) => wrapper.findAll('input.input-days').length

describe('AdvancedTime.vue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the stored relation with the dropdown keys resolved', () => {
    const { wrapper } = mountPanel([storedRelation()])

    expect(renderedRows(wrapper)[0]).toMatchObject({
      originSelection: { key: 'startdate' },
      targetSelection: { key: 'after_startdate' },
      targetInteraction: { key: TARGET, text: 'Diagnosis' },
      days: '[0-90]',
    })
    expect(renderedDays(wrapper)).toEqual(['[0-90]'])
    expect(renderedRowCount(wrapper)).toBe(1)
  })

  // "make it 30 days instead of 90" — same card, same target, so the relation COUNT
  // never changes and nothing about the panel's mount state does either.
  it('follows a relation replaced in the store while the panel is open', async () => {
    const { wrapper, setStored } = mountPanel([storedRelation()])

    await setStored([storedRelation({ days: '[0-30]' })])

    expect(renderedDays(wrapper)).toEqual(['[0-30]'])
    expect(renderedRows(wrapper)[0]).toMatchObject({ days: '[0-30]' })
  })

  it('follows a relation retargeted in the store while the panel is open', async () => {
    const { wrapper, setStored } = mountPanel([storedRelation()])

    await setStored([storedRelation({ targetInteraction: OTHER_TARGET, targetSelection: 'before_enddate' })])

    expect(renderedRows(wrapper)[0]).toMatchObject({
      targetSelection: { key: 'before_enddate' },
      targetInteraction: { key: OTHER_TARGET, text: 'Drug Exposure' },
    })
  })

  // A second relation on the same card is legal (the + button, and set_time_relation
  // keeps unrelated targets), so a resync must show the row that arrived, not just
  // re-read the ones it already had.
  it('picks up a second relation added to the store', async () => {
    const { wrapper, setStored } = mountPanel([storedRelation()])

    await setStored([storedRelation(), storedRelation({ targetInteraction: OTHER_TARGET, days: '>=7' })])

    expect(renderedDays(wrapper)).toEqual(['[0-90]', '>=7'])
    expect(renderedRowCount(wrapper)).toBe(2)
  })

  // The resync only reads. If it wrote back, every store change would bounce a
  // dispatch off this watcher — and an op that cleared a relation would find the
  // panel putting one back.
  it('never writes to the store while following it', async () => {
    const { setStored } = mountPanel([storedRelation()])
    updateFilterCardTimeFilter.mockClear()

    await setStored([storedRelation({ days: '[0-30]' })])

    expect(updateFilterCardTimeFilter).not.toHaveBeenCalled()
  })

  it('clears the rows when the stored relation is removed', async () => {
    const { wrapper, setStored } = mountPanel([storedRelation()])
    updateFilterCardTimeFilter.mockClear()

    await setStored([])

    expect(renderedDays(wrapper)).toEqual([])
    expect(renderedRowCount(wrapper)).toBe(0)
    expect(updateFilterCardTimeFilter).not.toHaveBeenCalled()
  })

  // The panel is also opened on a card that has no relation yet, and mounting on an
  // empty list seeds one blank row. That row is the model's own doing, so the resync
  // must not treat it as a divergence and wipe the placeholder text off it.
  it('keeps the blank row it seeds on an empty card', async () => {
    const { wrapper } = mountPanel([])
    await wrapper.vm.$nextTick()

    expect(renderedRows(wrapper)).toHaveLength(1)
    expect(renderedRows(wrapper)[0].targetInteraction).toEqual({
      key: '',
      text: 'MRI_PA_FILTERCARD_SELECTION_NONE',
    })
  })
})
