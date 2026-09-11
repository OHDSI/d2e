import express, { NextFunction, Response } from 'express'
import { Service } from 'typedi'
import { IAppRequest } from '../types'
import { createLogger } from '../Logger'
import { LogtoAPI, PortalAPI } from '../api'
import { resolveRoleStore } from '../services/UserGroupService'
import { env } from '../env'
import { permittedUserCheck } from '../middlewares/permitted-user-check'

@Service()
export class DatasetRoleRouter {
  public router = express.Router()
  private readonly logger = createLogger(this.constructor.name)

  constructor(
    private readonly logtoApi: LogtoAPI,
    private readonly portalApi: PortalAPI
  ) {
    this.registerRoutes()
  }

  private registerRoutes() {
    this.router.post('/', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { datasetId, tokenStudyCode, type } = req.body || {}

      if (!datasetId || !tokenStudyCode) {
        return res.status(400).send({ message: `Params 'datasetId' and 'tokenStudyCode' are required` })
      }

      try {
        // Roles are registered ahead of use only where the provider stores them
        // as objects with scopes. trex carries the role name in the token and
        // resolves it on assignment, so there is nothing to create here.
        if (resolveRoleStore(env.IDP_ROLE_STORE) !== 'trex') {
          await this.logtoApi.ensureDatasetRole(datasetId, tokenStudyCode, type)
        }
        return res.status(200).json({ datasetId, tokenStudyCode })
      } catch (err) {
        this.logger.error(`Failed to ensure dataset role for ${tokenStudyCode}: ${JSON.stringify(err)}`)
        return next(err)
      }
    })

    this.router.delete('/', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { datasetId, tokenStudyCode } = (req as any).query as { datasetId?: string; tokenStudyCode?: string }

      if (!datasetId || !tokenStudyCode) {
        return res.status(400).send({ message: `Query params 'datasetId' and 'tokenStudyCode' are required` })
      }

      try {
        if (resolveRoleStore(env.IDP_ROLE_STORE) !== 'trex') {
          await this.logtoApi.removeDatasetRole(datasetId, tokenStudyCode)
        }
        return res.status(200).json({ datasetId, tokenStudyCode })
      } catch (err) {
        this.logger.error(`Failed to remove dataset role for ${tokenStudyCode}: ${JSON.stringify(err)}`)
        return next(err)
      }
    })

    // One-shot backfill: idempotently re-applies ensureDatasetRole to all portal datasets.
    this.router.post('/sync-all', permittedUserCheck(), async (req: IAppRequest, res: Response, next: NextFunction) => {
      this.logger.info('Sync all dataset roles to Logto')

      try {
        const datasets = await this.portalApi.getDatasets()
        const results: {
          total: number
          synced: number
          skipped: number
          failed: number
          skips: { datasetId: string; reason: string }[]
          failures: { datasetId: string; tokenStudyCode?: string; error: string }[]
        } = {
          total: datasets.length,
          synced: 0,
          skipped: 0,
          failed: 0,
          skips: [],
          failures: []
        }

        for (const dataset of datasets) {
          if (!dataset.tokenStudyCode) {
            const reason = 'dataset has no tokenStudyCode'
            this.logger.warn(`${dataset.id}: ${reason}, skipping`)
            results.skipped++
            results.skips.push({ datasetId: dataset.id, reason })
            continue
          }

          try {
            if (resolveRoleStore(env.IDP_ROLE_STORE) !== 'trex') {
              await this.logtoApi.ensureDatasetRole(dataset.id, dataset.tokenStudyCode, dataset.type)
            }
            results.synced++
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            this.logger.error(`Failed to sync dataset ${dataset.id}: ${error}`)
            results.failed++
            results.failures.push({ datasetId: dataset.id, tokenStudyCode: dataset.tokenStudyCode, error })
          }
        }

        this.logger.info(`Dataset-role sync complete: ${JSON.stringify(results)}`)
        return res.status(200).json(results)
      } catch (err) {
        this.logger.error(`Error syncing dataset roles to Logto: ${JSON.stringify(err)}`)
        return next(err)
      }
    })
  }
}
