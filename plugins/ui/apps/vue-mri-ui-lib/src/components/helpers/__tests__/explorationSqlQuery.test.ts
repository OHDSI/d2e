import { describe, expect, it } from 'vitest'
import { chartQueryFor } from '../explorationSqlQuery'

const bookmark = { datasetId: 'ds-1', filter: { cards: { content: [] } } }

describe('chartQueryFor', () => {
  it('maps the stacked bar chart, carrying the datasetId off the bookmark', () => {
    const q = chartQueryFor('stacked', { bookmarksData: bookmark })
    expect(q?.url).toBe('/analytics-svc/api/services/population/json/barchart')
    expect(q?.params.mriquery).toBe(JSON.stringify(bookmark))
    expect(q?.params.datasetId).toBe('ds-1')
  })

  it('defaults an absent chart type to the bar chart, as the restore does', () => {
    for (const t of [undefined, null, '']) {
      expect(chartQueryFor(t, { bookmarksData: bookmark })?.url).toBe(
        '/analytics-svc/api/services/population/json/barchart'
      )
    }
  })

  it('maps boxplot and km, which send no datasetId', () => {
    const box = chartQueryFor('boxplot', { bookmarksData: bookmark })
    expect(box?.url).toBe('/analytics-svc/api/services/population/json/boxplot')
    expect(box?.params.datasetId).toBeUndefined()

    const km = chartQueryFor('km', { bookmarksData: bookmark })
    expect(km?.url).toBe('/analytics-svc/api/services/population/json/kaplanmeier')
    expect(km?.params.datasetId).toBeUndefined()
  })

  it('maps the patient list to its own endpoint and its own request shape', () => {
    const plRequest = { columns: ['a'] }
    const q = chartQueryFor('list', {
      bookmarksData: bookmark,
      patientListRequest: plRequest,
      datasetId: 'ds-9',
    })
    expect(q?.url).toBe('/analytics-svc/api/services/patient')
    // The list sends its own request, not the bookmark.
    expect(q?.params.mriquery).toBe(JSON.stringify(plRequest))
    expect(q?.params.datasetId).toBe('ds-9')
  })

  it('returns null for the list when its request or dataset is missing', () => {
    expect(chartQueryFor('list', { bookmarksData: bookmark })).toBeNull()
    expect(chartQueryFor('list', { bookmarksData: bookmark, patientListRequest: {} })).toBeNull()
  })

  it('returns null for an empty or absent bookmark, so no request is made', () => {
    expect(chartQueryFor('stacked', { bookmarksData: {} })).toBeNull()
    expect(chartQueryFor('stacked', { bookmarksData: null })).toBeNull()
    expect(chartQueryFor('stacked', { bookmarksData: undefined })).toBeNull()
  })

  it('returns null for a chart type it does not know', () => {
    expect(chartQueryFor('sunburst', { bookmarksData: bookmark })).toBeNull()
  })

  it('omits the datasetId when the bookmark carries none', () => {
    const q = chartQueryFor('stacked', { bookmarksData: { filter: {} } })
    expect(q?.params.datasetId).toBeUndefined()
    expect(q?.params.mriquery).toBeDefined()
  })
})
