# D2eDialog

Modal dialog with a titled header, optional close button, body slot and
equal-width action buttons.

```vue
<D2eDialog v-model="open" title="Rename exploration name">
  <D2eTextField v-model="name" label="Exploration name" required />
  <template #actions>
    <D2eButton variant="secondary">Cancel</D2eButton>
    <D2eButton>Rename</D2eButton>
  </template>
</D2eDialog>
```

## Props

| Prop            | Type                 | Default          | Notes                                                |
| --------------- | -------------------- | ---------------- | ---------------------------------------------------- |
| `modelValue`    | `boolean`            | required         | `v-model`                                            |
| `title`         | `string`             | `undefined`      | Header title; drives `aria-labelledby`               |
| `size`          | `'s' \| 'l' \| 'xl'` | `'s'`            | Figma Modal/S 540, Modal/L 900, Modal/XL 1200        |
| `maxWidth`      | `number \| string`   | `undefined`      | Escape hatch; overrides `size` when set              |
| `closeOnEscape` | `boolean`            | `true`           | Set false for long forms that confirm before discard |
| `showClose`     | `boolean`            | `true`           | Shows the header close button                        |
| `closeLabel`    | `string`             | `'Close dialog'` | Accessible name of the close button                  |
| `busy`          | `boolean`            | `false`          | Shows a spinner overlay and blocks every close path  |
| `attach`        | `string \| boolean`  | `'#app'`         | Vuetify overlay attach target                        |

## Events

| Event               | Payload   | Notes                                          |
| ------------------- | --------- | ---------------------------------------------- |
| `update:modelValue` | `boolean` | Fires on every open/close path unless busy     |
| `close`             | —         | Fires on scrim, Escape and close-button closes |

## Slots

| Slot      | Notes                                    |
| --------- | ---------------------------------------- |
| default   | Dialog body                              |
| `actions` | Footer; rendered with a divider above it |

> The scrim never dismisses a dialog — MODAL CLOSE BEHAVIOR (Figma 2106:162)
> specifies "Don't dismiss modal, no action" for every modal type. There is no
> `persistent` prop; Escape is the only closable axis and `closeOnEscape` controls it.
