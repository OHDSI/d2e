/**
 * Which backend query produces the SQL for a saved exploration.
 *
 * The Filter summary panel's "Download SQL" and "Copy SQL" actions read
 * `getResponse()?.data?.sql`, and only a chart query ever fills that
 * (`store/modules/query.ts` `fireQuery`). In the cohort builder a chart is
 * mounted, so the query has already run by the time the panel opens.
 *
 * The exploration page mounts no chart. `loadbookmarkToState` even skips the
 * request on purpose — it passes `skipFireRequest: chartIsChanging ||
 * !isRightPaneMounted`, and there is no right pane here. Without this the two
 * SQL actions download a 0-byte file and copy an empty string while still
 * reporting success.
 *
 * So the page fires the query itself, using the same url and params the chart
 * component for that chart type would have used. Kept as a pure function with
 * no Vue or store import so the mapping is testable on its own.
 */

/** The chart types a saved bookmark can carry. */
export type ExplorationChartType = 'stacked' | 'boxplot' | 'km' | 'list'

export interface ChartQuery {
  url: string
  params: Record<string, string>
}

export interface ChartQueryInput {
  /** `getBookmarksData` — the restored bookmark, which is itself the mriquery. */
  bookmarksData: unknown
  /** `getPLRequest({ useLimit: true })`, only needed for the patient list. */
  patientListRequest?: unknown
  /** `getSelectedDataset?.id`, only needed for the patient list. */
  datasetId?: string
}

const POPULATION = '/analytics-svc/api/services/population/json'

/**
 * The url and params for a chart type, or `null` when there is nothing to ask
 * for — an unknown type, or an empty bookmark.
 *
 * Each entry mirrors one chart component, so a change there must be mirrored
 * here: StackBarChart.vue, BoxplotChart.vue, KaplanMeier.vue and
 * PatientListContainer.vue respectively.
 */
export function chartQueryFor(
  chartType: string | null | undefined,
  input: ChartQueryInput
): ChartQuery | null {
  const bookmark = input.bookmarksData as Record<string, unknown> | null | undefined
  if (!bookmark || Object.keys(bookmark).length === 0) return null

  const mriquery = JSON.stringify(bookmark)

  switch (chartType) {
    case 'list': {
      // The patient list sends its own request shape, not the bookmark, and
      // `fireQuery` builds the SQL client-side by joining the rows' own `sql`.
      if (!input.patientListRequest || !input.datasetId) return null
      return {
        url: '/analytics-svc/api/services/patient',
        params: {
          mriquery: JSON.stringify(input.patientListRequest),
          datasetId: input.datasetId,
        },
      }
    }
    case 'boxplot':
      return { url: `${POPULATION}/boxplot`, params: { mriquery } }
    case 'km':
      return { url: `${POPULATION}/kaplanmeier`, params: { mriquery } }
    // A bookmark saved before the chart type was recorded restores as the
    // stacked bar chart, which is also the app's default view.
    case 'stacked':
    case undefined:
    case null:
    case '':
      return {
        url: `${POPULATION}/barchart`,
        params: {
          mriquery,
          // Only the bar chart passes a datasetId, and it takes it off the
          // bookmark rather than the selected dataset.
          ...(typeof bookmark.datasetId === 'string' ? { datasetId: bookmark.datasetId } : {}),
        },
      }
    default:
      return null
  }
}
