// Figma variables Modal/S, Modal/L and Modal/XL (design-system file
// lpbqxd8B0OkRKH9kJoCCEa). There is no Modal/M — 600 was never a design size.
//
// Modal/XL is documented as responsive in the MODAL SIZE GUIDE frame (40px
// from the window edge, 32px top and bottom) rather than a fixed 1200. The
// value here is the variable; the responsive rule is not implemented yet.
export const DIALOG_SIZE_MAP = { s: 540, l: 900, xl: 1200 } as const;

export type D2eDialogSize = keyof typeof DIALOG_SIZE_MAP;
