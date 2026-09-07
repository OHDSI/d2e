import { FONT_FAMILY } from '@/utils/Constants'

/**
 * Color palette for inclusion report visualizations
 * Colors represent different levels of rule failures, from most failures (red) to no failures (green)
 */
export const INCLUSION_REPORT_COLORS = {
  allFailedOr5Plus: '#ffe799',
  threeToFour: '#ece696',
  two: '#d8e593',
  one: '#c3e490',
  allPassed: '#aee28d',
} as const

/**
 * Array of colors ordered from most failures to least failures
 * Used for funnel chart visualization
 */
export const COLORS_ARRAY = [
  INCLUSION_REPORT_COLORS.allFailedOr5Plus,
  INCLUSION_REPORT_COLORS.threeToFour,
  INCLUSION_REPORT_COLORS.two,
  INCLUSION_REPORT_COLORS.one,
  INCLUSION_REPORT_COLORS.allPassed,
] as const

/**
 * Thresholds for funnel chart color mapping
 * Represents the ratio of remaining population after each rule
 */
export const FUNNEL_THRESHOLDS = [0.1, 0.25, 0.5, 0.75] as const

/**
 * Legend labels for funnel chart
 * Corresponds to the color thresholds
 */
export const FUNNEL_LEGEND_LABELS = ['>90% lost', '75-90% lost', '50-75% lost', '25-50% lost', '<25% lost'] as const

/**
 * Legend items for treemap visualization
 * Maps failure counts to human-readable labels and colors
 */
export const TREEMAP_LEGEND_ITEMS = [
  { name: 'All criteria passed', color: INCLUSION_REPORT_COLORS.allPassed },
  { name: '1 criterion failed', color: INCLUSION_REPORT_COLORS.one },
  { name: '2 criteria failed', color: INCLUSION_REPORT_COLORS.two },
  { name: '3-4 criteria failed', color: INCLUSION_REPORT_COLORS.threeToFour },
  { name: '5+ criteria failed', color: INCLUSION_REPORT_COLORS.allFailedOr5Plus },
] as const

/**
 * Gray color used for filtered out/excluded items in treemap
 */
export const EXCLUDED_COLOR = '#CCCCCC' as const

/**
 * Font the funnel chart is rendered with: vue-mri's own stack rather than plotly's Open Sans
 * default, so the chart reads like the rest of the app. Handed to plotly explicitly - for the
 * hover labels too, which otherwise fall back to plotly's Arial - so label widths can be
 * measured off-screen with exactly the font plotly draws.
 */
export const FUNNEL_FONT_SIZE = 16
export const FUNNEL_FONT_FAMILY = FONT_FAMILY

/**
 * Layout budget for the rule name labels down the left of the funnel chart: labels wrap
 * at this width and are cut off with an ellipsis once they run past the line limit, so a
 * long rule name can never squeeze the funnel itself.
 */
export const FUNNEL_LABEL_MAX_WIDTH = 220
export const FUNNEL_LABEL_MAX_LINES = 3

/**
 * Plotly anchors a hover label at the right edge of its bar and flips it to the left of the bar
 * once it no longer fits in the space left over, so an unwrapped rule name would send that one
 * row's tooltip to the other side of the chart. Wrapping the name to this width keeps every
 * tooltip narrower than the room beside the widest bar, down to a chart around 700px wide.
 */
export const FUNNEL_HOVER_MAX_WIDTH = 165
export const FUNNEL_HOVER_FONT_SIZE = 13
