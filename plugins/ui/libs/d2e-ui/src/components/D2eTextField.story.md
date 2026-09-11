# D2eTextField

Outlined text field wrapper with error and validation props.

```vue
<D2eTextField
  v-model="name"
  label="Exploration name"
  required
  :error-messages="errorMessages"
/>
```

## Props

| Prop            | Type                 | Default     | Notes                      |
| --------------- | -------------------- | ----------- | -------------------------- |
| `modelValue`    | `string`             | `''`        | `v-model`                  |
| `label`         | `string`             | `undefined` | Floating label             |
| `required`      | `boolean`            | `false`     | Renders the label asterisk |
| `errorMessages` | `string \| string[]` | `undefined` | Passed to Vuetify          |
| `maxlength`     | `number \| string`   | `undefined` | Passed to the input        |
| `placeholder`   | `string`             | `undefined` | Input placeholder          |
| `autofocus`     | `boolean`            | `false`     | Focuses the input on mount |

## Events

| Event               | Payload  |
| ------------------- | -------- |
| `update:modelValue` | `string` |

## Slots

None. All other attrs are forwarded to `v-text-field`.
