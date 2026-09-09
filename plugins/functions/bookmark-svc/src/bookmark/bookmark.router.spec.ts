import { Router } from 'express'
import { BookmarkRouter } from './bookmark.router'
import * as bookmarkService from './bookmark.service'
import { PortalAPI } from '../api/PortalAPI'
import { IMRIRequest } from '../types'

// `queryBookmarks` is wrapped so calls can be asserted on, but the wrapper
// delegates to the real implementation by default: tests that exercise the
// `duplicate` command still run the real `_duplicateBookmark` /
// `loadSingleBookmark` / `_insertBookmark` composition, only the network
// boundary (`PortalAPI`) is mocked per test below.
jest.mock('./bookmark.service', () => {
  const actual = jest.requireActual('./bookmark.service')
  return {
    ...actual,
    queryBookmarks: jest.fn(actual.queryBookmarks),
  }
})

const queryBookmarksMock = bookmarkService.queryBookmarks as jest.Mock

describe('BookmarkRouter', () => {
  let router: Router

  beforeAll(() => {
    router = new BookmarkRouter().getRouter()
  })

  describe('has routes', () => {
    const routes = [
      { path: '/', method: 'get' },
      { path: `/`, method: 'post' },
      { path: '/:bookmarkId', method: 'put' },
      { path: '/:bookmarkId', method: 'delete' },
      { path: `/bookmarkIds`, method: 'delete' },
      { path: '/:bookmarkId/duplicate', method: 'post' },
    ]

    test.each(routes)('`$method` exists on $path', (route, done) => {
      expect(router.stack.some(s => Object.keys(s.route.methods).includes(route.method))).toBe(true)
      expect(router.stack.some(s => s.route.path === route.path)).toBe(true)
      done()
    })
  })

  describe('duplicate route', () => {
    afterEach(() => {
      queryBookmarksMock.mockClear()
    })

    it('sets cmd to duplicate and bmkId from the path parameter before dispatching', async () => {
      queryBookmarksMock.mockImplementationOnce((_body, _userName, _token, _configConnection, callback) => {
        callback(null, { status: 'success' })
      })

      const layer = router.stack.find(s => s.route && s.route.path === '/:bookmarkId/duplicate')
      const handler = layer.route.stack[layer.route.stack.length - 1].handle

      const req = {
        params: { bookmarkId: 'source-bmk-id' },
        body: { newName: 'Copy of Original', paConfigId: 'pa1', cdmConfigId: 'cdm1', cdmConfigVersion: '1', datasetId: 'ds1' },
        headers: { authorization: 'Bearer test-token' },
        userName: 'tester',
        dbConnections: { configConnection: {}, analyticsConnection: {} },
      } as unknown as IMRIRequest
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() }

      await handler(req, res, jest.fn())

      expect(queryBookmarksMock).toHaveBeenCalledTimes(1)
      const [body] = queryBookmarksMock.mock.calls[0]
      expect(body.cmd).toBe('duplicate')
      expect(body.bmkId).toBe('source-bmk-id')
    })
  })
})

describe('queryBookmarks - duplicate', () => {
  const userName = 'testUser'
  const bookmarkId = 'source-bmk-id'
  const paConfigId = 'paConfigId1'
  const cdmConfigId = 'cdmConfigId1'
  const cdmConfigVersion = '1'
  const token = 'Bearer test-token'
  const datasetId = 'dataset1'

  const baseSourceRow = {
    id: bookmarkId,
    bookmark_name: 'Original',
    pa_config_id: paConfigId,
    modified: '2026-01-01T00:00:00.000Z',
    version: 1,
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // `queryBookmarks` fires `_duplicateBookmark` without awaiting it (matching
  // every other command case, e.g. 'rename', 'insert'), so the callback is
  // the only reliable completion signal. Waiting on the returned promise
  // alone races the assertions against the still-pending duplicate work.
  function callDuplicate(body: Record<string, unknown>): Promise<[unknown, unknown]> {
    return new Promise(resolve => {
      queryBookmarksMock(
        { cmd: 'duplicate', bmkId: bookmarkId, paConfigId, cdmConfigId, cdmConfigVersion, datasetId, ...body },
        userName,
        token,
        {},
        (err: unknown, data: unknown) => resolve([err, data])
      )
    })
  }

  it('duplicates a bookmark: loads the source, then inserts a copy with the new name, the source payload, and shareBookmark false', async () => {
    const sourceRow = { ...baseSourceRow, bookmark: '{"filters":["a"]}', user_id: userName, shared: true }
    jest.spyOn(PortalAPI.prototype, 'getBookmarkById').mockResolvedValue(sourceRow)
    const createBookmarkSpy = jest.spyOn(PortalAPI.prototype, 'createBookmark').mockResolvedValue({ status: 'ok' })

    const [err, data] = await callDuplicate({ newName: 'Copy of Original' })

    expect(createBookmarkSpy).toHaveBeenCalledTimes(1)
    const [dto] = createBookmarkSpy.mock.calls[0]
    expect(dto.serviceArtifact.bookmark_name).toBe('Copy of Original')
    expect(dto.serviceArtifact.bookmark).toBe(sourceRow.bookmark)
    // the copy always starts unshared, regardless of the source's sharing state (source.shared is true above)
    expect(dto.serviceArtifact.shared).toBe(false)
    expect(err).toBeNull()
    expect(data).toEqual(expect.objectContaining({ status: 'success', bmkId: expect.any(String) }))
  })

  it('converts a Uint8Array bookmark payload from the source to a string before inserting the copy (the IFR pass-through)', async () => {
    const filterJson = '{"filters":["b","c"]}'
    const sourceRow = {
      ...baseSourceRow,
      bookmark: new TextEncoder().encode(filterJson),
      user_id: userName,
      shared: false,
    }
    jest.spyOn(PortalAPI.prototype, 'getBookmarkById').mockResolvedValue(sourceRow)
    const createBookmarkSpy = jest.spyOn(PortalAPI.prototype, 'createBookmark').mockResolvedValue({ status: 'ok' })

    await callDuplicate({ newName: 'Copy' })

    expect(createBookmarkSpy).toHaveBeenCalledTimes(1)
    const [dto] = createBookmarkSpy.mock.calls[0]
    expect(typeof dto.serviceArtifact.bookmark).toBe('string')
    expect(dto.serviceArtifact.bookmark).toBe(filterJson)
  })

  it('rejects an empty name and never inserts', async () => {
    const createBookmarkSpy = jest.spyOn(PortalAPI.prototype, 'createBookmark')

    const [err, data] = await callDuplicate({ newName: '   ' })

    expect(err).toBe('Bookmark name cannot be empty')
    expect(data).toBeNull()
    expect(createBookmarkSpy).not.toHaveBeenCalled()
  })

  it('errors when the source bookmark cannot be found, and never inserts', async () => {
    jest.spyOn(PortalAPI.prototype, 'getBookmarkById').mockRejectedValue(new Error('not found'))
    const createBookmarkSpy = jest.spyOn(PortalAPI.prototype, 'createBookmark')

    const [err, data] = await callDuplicate({ bmkId: 'missing-bmk-id', newName: 'Copy' })

    expect(err).toBeTruthy()
    expect(data).toBeNull()
    expect(createBookmarkSpy).not.toHaveBeenCalled()
  })

  it('does not duplicate a bookmark belonging to another user, and never inserts', async () => {
    const otherUsersRow = { ...baseSourceRow, bookmark: '{}', user_id: 'someone-else', shared: false }
    jest.spyOn(PortalAPI.prototype, 'getBookmarkById').mockResolvedValue(otherUsersRow)
    const createBookmarkSpy = jest.spyOn(PortalAPI.prototype, 'createBookmark')

    const [err, data] = await callDuplicate({ newName: 'Copy' })

    expect(err).toBeTruthy()
    expect(data).toBeNull()
    expect(createBookmarkSpy).not.toHaveBeenCalled()
  })
})
