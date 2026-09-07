import { AxiosRequestConfig } from "../../../_shared/_axios.ts"
import { Service } from 'typedi'
import https from 'https'
import { createLogger } from '../Logger'
import { env, services } from '../env'
import { IClientCredentials, OpenIDAPI } from './OpenIDAPI'
import { Logger } from 'winston'

type ITokenExchangeOptions = Omit<IClientCredentials, 'clientId' | 'clientSecret' | 'scope'>

@Service()
export abstract class BaseIDPAPI {
  protected readonly logger: Logger
  protected readonly baseUrl: string
  protected readonly issuerUrl: string

  private readonly httpsAgent: https.Agent

  constructor() {
    this.baseUrl = env.IDP_BASE_URL!
    this.issuerUrl = services.idIssuerUrl!
    this.logger = createLogger(this.constructor.name)

    // this.httpsAgent = new https.Agent({
    //   rejectUnauthorized: this.issuerUrl.startsWith('https://alp-logto-') ? false : true,
    //   ca: this.issuerUrl.startsWith('https://alp-logto-') ? env.SSL_CA_CERT : undefined
    // })
  }

  protected async getRequestConfig(scope: string, params?: ITokenExchangeOptions) {
    let options: AxiosRequestConfig = { 
      // httpsAgent: this.httpsAgent 
    }

    const token = await this.getToken(scope, params)
    if (!token || !token.access_token) {
      this.logger.error('Unable to get access token')
      throw new Error('Unable to get access token')
    }

    if (token) {
      options = {
        ...options,
        headers: {
          Authorization: `Bearer ${token.access_token}`
        }
      }
    }

    return options
  }

  protected async getToken(scope: string, params?: ITokenExchangeOptions) {
    if (!this.issuerUrl) {
      this.logger.error('IDP_BASE_URL is not defined')
      throw new Error('IDP_BASE_URL is not defined')
    }

    const clientId = env.IDP_ALP_ADMIN_CLIENT_ID
    if (!clientId) {
      this.logger.error('IDP_ALP_ADMIN_CLIENT_ID is not defined')
      throw new Error('IDP_ALP_ADMIN_CLIENT_ID is not defined')
    }

    const clientSecret = env.IDP_ALP_ADMIN_CLIENT_SECRET
    if (!clientSecret) {
      this.logger.error('IDP_ALP_ADMIN_CLIENT_SECRET is not defined')
      throw new Error('IDP_ALP_ADMIN_CLIENT_SECRET is not defined')
    }

    const client = new OpenIDAPI({ issuerUrl: this.issuerUrl })

    this.logger.info('Get client credentials token')
    return await client.getClientCredentialsToken({ clientId, clientSecret, scope, ...params })
  }
}
