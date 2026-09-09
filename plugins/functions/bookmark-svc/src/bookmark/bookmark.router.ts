import { Logger } from '@alp/alp-base-utils'
import { Router, NextFunction, Response } from 'express'
import { IMRIRequest } from '../types'
import { Service } from 'typedi'
import { queryBookmarks } from './bookmark.service'
import { getUser } from '@alp/alp-base-utils'
import MRIEndpointErrorHandler from '../utils/MRIEndpointErrorHandler'
import { validate } from '../middleware/route-check'
import {
  bookmarkIdSchema,
  bookmarkIdsSchema,
  updateBookmarkSchema,
  createBookmarkSchema,
  deleteBookmarkSchema,
  duplicateBookmarkSchema,
} from '../types'
@Service()
export class BookmarkRouter {
  private readonly router = Router()
  private readonly log = Logger.CreateLogger(this.constructor.name)

  constructor() {
    this.registerRoutes()
  }
  getRouter() {
    return this.router
  }

  private registerRoutes() {
    this.router.get('/', validate(bookmarkIdSchema), async (req: IMRIRequest, res: Response, next: NextFunction) => {
      this.log.info('Get bookmark list')

      try {
        const { configConnection } = req.dbConnections
        const user = getUser(req)

        const { paConfigId, datasetId } = req.query
        const userName = req.userName
        const language = user.lang

        const token = req.headers['authorization']

        req.body.cmd = 'loadAll'
        req.body.paConfigId = paConfigId || ''
        req.body.datasetId = datasetId

        await queryBookmarks(req.body, userName, token, configConnection, (err, data) => {
          if (err) {
            return res.status(500).send(MRIEndpointErrorHandler({ err, language }))
          } else {
            if (data && data.bookmarks && data.bookmarks.length > 0) {
              data.bookmarks.forEach(el => {
                if (el.ViewName && el.ViewName === 'NoValue') {
                  el.ViewName = ''
                }
              })
            }
            res.status(200).json(data)
          }
        })
      } catch (err) {
        this.log.error(`Failed to load all bookmarks: ${JSON.stringify(err)}`)
      }
    })

    this.router.post(
      '/',
      validate(createBookmarkSchema),
      async (req: IMRIRequest, res: Response, next: NextFunction) => {
        this.log.info('Create bookmark')
        try {
          const { configConnection } = req.dbConnections
          const user = getUser(req)
          const language = user.lang
          const userName = req.userName
          const token = req.headers['authorization']

          queryBookmarks(req.body, userName, token, configConnection, (err, data) => {
            if (err) {
              return res.status(500).send(MRIEndpointErrorHandler({ err, language }))
            } else {
              res.status(200).json(data)
            }
          })
        } catch (err) {
          this.log.error(`Failed to create bookamark: ${JSON.stringify(err)}`)
        }
      }
    )

    this.router.put(
      '/:bookmarkId',
      validate(updateBookmarkSchema),
      async (req: IMRIRequest, res: Response, next: NextFunction) => {
        this.log.info('Update bookmark')
        try {
          const { configConnection } = req.dbConnections
          const user = getUser(req)
          const language = user.lang
          const userName = req.userName
          const token = req.headers['authorization']

          req.body.bmkId = req.params.bookmarkId

          queryBookmarks(req.body, userName, token, configConnection, (err, data) => {
            if (err) {
              return res.status(500).send(MRIEndpointErrorHandler({ err, language }))
            } else {
              res.status(200).json(data)
            }
          })
        } catch (err) {
          this.log.error(`Failed to update bookamark: ${JSON.stringify(err)}`)
        }
      }
    )

    this.router.delete(
      '/:bookmarkId',
      validate(deleteBookmarkSchema),
      async (req: IMRIRequest, res: Response, next: NextFunction) => {
        this.log.info('Delete bookmark')

        try {
          const { configConnection } = req.dbConnections
          const user = getUser(req)
          const language = user.lang
          const userName = req.userName
          const token = req.headers['authorization']

          req.body.cmd = 'delete'
          req.body.bmkId = req.params.bookmarkId

          queryBookmarks(req.body, userName, token, configConnection, (err, data) => {
            if (err) {
              return res.status(500).send(MRIEndpointErrorHandler({ err, language }))
            } else {
              res.status(200).json(data)
            }
          })
        } catch (err) {
          this.log.error(`Failed to delete bookamark: ${JSON.stringify(err)}`)
        }
      }
    )

    this.router.post(
      '/:bookmarkId/duplicate',
      validate(duplicateBookmarkSchema),
      async (req: IMRIRequest, res: Response, next: NextFunction) => {
        this.log.info('Duplicate bookmark')

        try {
          const { configConnection } = req.dbConnections
          const user = getUser(req)
          const language = user.lang
          const userName = req.userName
          const token = req.headers['authorization']

          req.body.cmd = 'duplicate'
          req.body.bmkId = req.params.bookmarkId

          queryBookmarks(req.body, userName, token, configConnection, (err, data) => {
            if (err) {
              return res.status(500).send(MRIEndpointErrorHandler({ err, language }))
            } else {
              res.status(200).json(data)
            }
          })
        } catch (err) {
          this.log.error(`Failed to duplicate bookmark: ${JSON.stringify(err)}`)
        }
      }
    )

    this.router.get(
      '/bookmarkIds',
      validate(bookmarkIdsSchema),
      async (req: IMRIRequest, res: Response, next: NextFunction) => {
        this.log.info('Get bookmark ids')

        try {
          const { configConnection } = req.dbConnections
          const user = getUser(req)
          const language = user.lang
          const userName = req.userName
          const datasetId = req.query.datasetId

          req.body.cmd = 'loadByIDs'
          req.body.bmkIds = (req.query.ids as string).split(',')
          req.body.paConfigId = req.query.paConfigId
          req.body.datasetId = datasetId

          const token = req.headers['authorization']

          queryBookmarks(req.body, userName, token, configConnection, (err, data) => {
            if (err) {
              return res.status(500).send(MRIEndpointErrorHandler({ err, language }))
            } else {
              res.status(200).json(data)
            }
          })
        } catch (err) {
          this.log.error(`Failed to load bookmarks by Ids: ${JSON.stringify(err)}`)
        }
      }
    )
  }
}
