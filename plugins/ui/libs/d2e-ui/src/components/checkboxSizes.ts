// Values from Figma component set 2047:3542 ("Checkbox"), read 2026-09-03.
// box   = the square glyph. padding = the ring of empty space around it (9 px in Figma).
// ripple = diameter of the focus / pressed circle.
export const CHECKBOX_SIZE_MAP = {
  sm: { box: 20, padding: 9, ripple: 34 },
  md: { box: 24, padding: 9, ripple: 38 },
} as const;

export type D2eCheckboxSize = keyof typeof CHECKBOX_SIZE_MAP;
