<script setup lang="ts">
import { ref } from "vue";
import D2eDialog from "./D2eDialog.vue";
import D2eButton from "./D2eButton.vue";
import D2eTextField from "./D2eTextField.vue";

const open = ref(true);
const renameOpen = ref(true);
const deleteOpen = ref(true);
const materializeOpen = ref(true);
const busyOpen = ref(true);
const persistentOpen = ref(true);
const sizeSOpen = ref(true);
const sizeLOpen = ref(true);
const sizeXlOpen = ref(true);
const name = ref("SNRI Users");
const description = ref("");
</script>

<template>
  <Story title="D2eDialog" group="components" responsive-disabled>
    <Variant title="default">
      <D2eDialog v-model="open" title="Dialog title">
        Dialog body content.
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton> Confirm </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="size S — 540 (default)">
      <D2eDialog v-model="sizeSOpen" title="Modal/S" size="s">
        <code>size="s"</code> — max-width 540 px. This is the default, and the
        size the rename, delete and materialize frames use.
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton> Confirm </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="size L — 900">
      <D2eDialog v-model="sizeLOpen" title="Modal/L" size="l">
        <code>size="l"</code> — max-width 900 px.
        <p class="story-note">
          The preview scales with the window. Below about 1900 px of browser
          width the dialog clamps to the pane instead of reaching 900 px — which
          is the same thing a real browser does at that size.
        </p>
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton> Confirm </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="size XL — 1200">
      <D2eDialog v-model="sizeXlOpen" title="Modal/XL" size="xl">
        <code>size="xl"</code> — max-width 1200 px.
        <p class="story-note">
          Needs roughly 2500 px of browser width to reach 1200 px; it clamps to
          the pane below that. Figma also documents XL as responsive (40 px from
          the window edge); that rule is not implemented yet.
        </p>
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton> Confirm </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="rename dialog (#3122)">
      <D2eDialog v-model="renameOpen" title="Rename exploration name">
        <D2eTextField
          v-model="name"
          label="Exploration name"
          required
          autofocus
        />
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton> Rename </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="delete dialog (#3124)">
      <D2eDialog v-model="deleteOpen" title="Delete filter?">
        Deleting this saved filter will delete any access point that you
        generated for it. This action cannot be undone.
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton variant="danger"> Yes, delete </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="materialize dialog (#3118)">
      <D2eDialog v-model="materializeOpen" title="Materialize cohort">
        <D2eTextField
          v-model="description"
          label="Cohort materialization description"
        />
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton> Materialize </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="busy">
      <D2eDialog v-model="busyOpen" title="Saving" busy>
        The dialog blocks every close path while busy.
        <template #actions>
          <D2eButton variant="secondary" disabled> Cancel </D2eButton>
          <D2eButton loading> Save </D2eButton>
        </template>
      </D2eDialog>
    </Variant>

    <Variant title="no escape close (long form)">
      <D2eDialog
        v-model="persistentOpen"
        title="Unsaved changes"
        :close-on-escape="false"
      >
        The scrim never closes a dialog. Escape is disabled here too, because a
        long form must raise a confirm-discard step instead.
        <template #actions>
          <D2eButton variant="secondary"> Cancel </D2eButton>
          <D2eButton> Confirm </D2eButton>
        </template>
      </D2eDialog>
    </Variant>
  </Story>
</template>

<style scoped>
.story-note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: #595757;
}
</style>
