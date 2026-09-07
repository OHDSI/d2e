import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createStore } from 'vuex'
import UnsavedChangesDialog from '../UnsavedChangesDialog.vue'

const vuetify = createVuetify({ components, directives })

const createTestStore = () =>
  createStore({
    getters: {
      getText:
        () =>
        (key: string): string =>
          key,
    },
  })

const createAppContainer = (): HTMLElement => {
  let app = document.querySelector('#app')
  if (!app) {
    app = document.createElement('div')
    app.id = 'app'
    document.body.appendChild(app)
  }
  return app as HTMLElement
}

const clearBody = (): void => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild)
  }
}

const mountDialog = (modelValue = true) =>
  mount(UnsavedChangesDialog, {
    props: { modelValue },
    attachTo: document.body,
    global: {
      plugins: [vuetify, createTestStore()],
    },
  })

const queryDialog = (): HTMLElement | null => document.querySelector('[data-testid="unsaved-changes-dialog"]')

const queryStayButton = (): HTMLElement | null => document.querySelector('[data-testid="stay-page-button"]')

const queryLeaveButton = (): HTMLElement | null => document.querySelector('[data-testid="leave-page-button"]')

const queryCloseButton = (): HTMLElement | null => document.querySelector('[data-testid="d2e-dialog-close"]')

describe('UnsavedChangesDialog', () => {
  beforeEach(() => {
    clearBody()
    createAppContainer()
  })

  it('renders dialog content when modelValue is true', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    expect(queryDialog()).not.toBeNull()
    wrapper.unmount()
  })

  it('does not render dialog content when modelValue is false', async () => {
    const wrapper = mountDialog(false)
    await wrapper.vm.$nextTick()
    expect(queryDialog()).toBeNull()
    wrapper.unmount()
  })

  it('displays title and body text via i18n keys', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    const dialog = queryDialog()
    expect(dialog?.textContent).toContain('MRI_PA_BOOKMARK_UNSAVED_DIALOG_TITLE')
    expect(dialog?.textContent).toContain('MRI_PA_BOOKMARK_UNSAVED_DIALOG_TEXT')
    wrapper.unmount()
  })

  it('does not render the removed question text key', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    const dialog = queryDialog()
    expect(dialog?.textContent).not.toContain('MRI_PA_BOOKMARK_UNSAVED_DIALOG_QUESTION_TEXT')
    wrapper.unmount()
  })

  it('renders Stay on Page as primary flat button', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    const stayButton = queryStayButton()
    expect(stayButton).not.toBeNull()
    expect(stayButton?.textContent).toContain('MRI_PA_BUTTON_STAY_ON_PAGE')
    expect(stayButton?.classList.contains('v-btn--variant-flat')).toBe(true)
    wrapper.unmount()
  })

  it('renders Leave Without Saving as outlined secondary button', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    const leaveButton = queryLeaveButton()
    expect(leaveButton).not.toBeNull()
    expect(leaveButton?.textContent).toContain('MRI_PA_BUTTON_LEAVE_WITHOUT_SAVING')
    expect(leaveButton?.classList.contains('v-btn--variant-outlined')).toBe(true)
    wrapper.unmount()
  })

  it('emits "stay" when Stay on Page button is clicked', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    queryStayButton()?.click()
    expect(wrapper.emitted('stay')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits "leave" when Leave Without Saving button is clicked', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    queryLeaveButton()?.click()
    expect(wrapper.emitted('leave')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits "stay" when close X button is clicked', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    queryCloseButton()?.click()
    expect(wrapper.emitted('stay')).toBeTruthy()
    wrapper.unmount()
  })
})
