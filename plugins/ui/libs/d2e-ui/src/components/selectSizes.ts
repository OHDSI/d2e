// Values from Figma component set 69:1398 ("Selection"), variant Outlined,
// read 2026-09-03. height = the outlined box; the Default variant is 4 px taller
// at the small size, and is not implemented here.
export const SELECT_SIZE_MAP = {
  sm: { height: 40 },
  md: { height: 48 },
} as const;

export type D2eSelectSize = keyof typeof SELECT_SIZE_MAP;

export interface D2eSelectItem {
  label: string;
  value: string;
  disabled?: boolean;
}
