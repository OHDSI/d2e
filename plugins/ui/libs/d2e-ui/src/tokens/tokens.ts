export const tokens = {
  color: {
    primary: "#000080",
    primaryLight: "#333399",
    primaryLighter: "#999FCB",
    primaryLightest: "#CCCFE5",
    primaryXtraLightest: "#E5E6F2",
    primaryXXLightest: "#F8F8FF",
    secondary: "#FF5E59",
    neutralBlack: "#000000",
    neutral: "#595757",
    neutralLight: "#ACABA8",
    neutralLighter: "#DEDCDA",
    neutralLightest: "#F2F0F1",
    neutralXtraLightest: "#FAF8F8",
    success: "#00855F",
    successLight: "#E1FFF6",
    warning: "#F89C0E",
    warningLight: "#FFF8E2",
    warningText: "#CD6000",
    // Functional/Alarm — the destructive red used on the delete dialog and
    // negative chips. #A3293D (feedback-error) remains the current Vuetify
    // `danger` value pending the slice-1 diff decision.
    alarm: "#D53939",
    alarmLight: "#FDEDED",
    supportBlueLight: "#CCDEF1",
    supportBlueLightest: "#EBF2FA",
    // Figma has no red token on the dialog frames; #A3293D is the existing
    // feedback-error value in the app Vuetify theme. Replace once design
    // supplies an official danger token.
    danger: "#A3293D",
    textSecondary: "#00000099",
    white: "#FFFFFF",
  },
  spacing: {
    xxs: 4,
    xs: 8,
    xsS: 12,
    s: 16,
    m: 24,
    l: 32,
    xl: 40,
    xxl: 56,
    xxxl: 64,
    number: 72,
  },
  // Figma names: XS 4, S 8, M 16, L 24, XL 32. The legacy sm/md/lg keys keep
  // their original values (XS/S/M) for backward compatibility.
  radius: { sm: 4, md: 8, lg: 16, l: 24, xl: 32 },
  borderWidth: { sm: 1, md: 2 },
  font: {
    // Figma letter-spacing of -2 on the headings is a percentage, not pixels:
    // the Heading 4 spec renders as tracking -0.48px at 24px, i.e. -2%.
    family:
      '"IBM Plex Sans Variable", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    heading1: {
      size: 60,
      weight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
    },
    heading2: {
      size: 48,
      weight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
    },
    heading3: {
      size: 34,
      weight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
    },
    heading4: {
      size: 24,
      weight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
    },
    heading5: { size: 18, weight: 600, lineHeight: 1.2, letterSpacing: "0" },
    subtitle1: { size: 16, weight: 600, lineHeight: 1.5, letterSpacing: "0" },
    subtitle2: { size: 14, weight: 600, lineHeight: 1.5, letterSpacing: "0" },
    body1: { size: 16, weight: 400, lineHeight: 1.5, letterSpacing: "0" },
    body2: { size: 14, weight: 400, lineHeight: 1.5, letterSpacing: "0" },
    caption1: { size: 12, weight: 400, lineHeight: 1.4, letterSpacing: "0" },
    caption2: { size: 10, weight: 400, lineHeight: 1.4, letterSpacing: "0" },
    button: { size: 16, weight: 500, lineHeight: "16px", letterSpacing: "0" },
  },
  // Figma variables Modal/S, Modal/L, Modal/XL. There is no Modal/M, and 600
  // is not a size in the design system — an earlier extraction invented it.
  // The MODAL SIZE GUIDE frame labels 900 "Medium" and 1200 "Large", which
  // disagrees with these variable names. The values are certain; the naming is
  // an open question with design.
  modal: { s: 540, l: 900, xl: 1200 },
  elevation: {
    card: "0 0 10px rgba(0, 0, 0, 0.10)",
    e1: "0 2px 1px -1px rgba(0,0,0,0.20), 0 1px 1px 0 rgba(0,0,0,0.14), 0 1px 3px 0 rgba(0,0,0,0.12)",
    e2: "0 3px 1px -2px rgba(0,0,0,0.20), 0 2px 2px 0 rgba(0,0,0,0.14), 0 1px 5px 0 rgba(0,0,0,0.12)",
    e8: "0 5px 5px -3px rgba(0,0,0,0.20), 0 8px 10px 1px rgba(0,0,0,0.14), 0 3px 14px 2px rgba(0,0,0,0.12)",
    e16: "0 8px 10px -5px rgba(0,0,0,0.20), 0 16px 24px 2px rgba(0,0,0,0.14), 0 6px 30px 5px rgba(0,0,0,0.12)",
  },
} as const;

export type D2eTokens = typeof tokens;
