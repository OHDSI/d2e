import { Container, Service } from 'typedi'
import { AxiosRequestConfig } from "../../../_shared/_axios.ts"
import { createLogger } from '../Logger'
import { CONTAINER_KEY } from '../const'
import https from 'https'
import { services } from '../env'
import { IPortalDataset, ITenant } from '../types'
@Service()
export class PortalAPI {
  private readonly baseURL: string
  // disable as https is not working for trex internal yet
  // private readonly httpsAgent: any
  private readonly logger = createLogger(this.constructor.name)
  private readonly channel

  constructor() {
    if (services.portalServer) {
      this.baseURL = services.portalServer
      this.channel = Trex.tokioChannel('d2e-functions/portal')
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: false,
      //   ca: env.SSL_CA_CERT
      // })
    } else {
      throw new Error('No url is set for PortalAPI')
    }
  }

  private async getRequestConfig() {
    let options: AxiosRequestConfig = {}

    const authHeader = Container.get<string>(CONTAINER_KEY.AUTHORIZATION_HEADER)
    if (authHeader) {
      options = {
        ...options,
        headers: {
          Authorization: authHeader
        }
      }
    }

    return options
  }

  async getMyTenants(): Promise<ITenant[]> {
    try {
      const options = await this.getRequestConfig()
      const result = await this.channel.get(`${this.baseURL}/tenant/list/me`, options)
      return result.data
    } catch (error) {
      this.logger.error(`Error when get my tenant: ${JSON.stringify(error?.response?.data || error?.code)}`)
      throw new Error(`Error when get my tenant`)
      //return [{ id: "e0348e4d-2e17-43f2-a3c6-efd752d17c23", name: "Tenant" }]
    }
  }

  async getDataset(id: string) {
    try {
      const timestamp = new Date().valueOf()
      console.time(`time-usermgmt-svc-getDataset-${timestamp}`)
      const options = await this.getRequestConfig()
      const result = await this.channel.get(`${this.baseURL}/dataset?datasetId=${id}`, options)
      console.timeEnd(`time-usermgmt-svc-getDataset-${timestamp}`)
      return result.data
    } catch (error) {
      this.logger.error(`Error when get study ${id}: ${JSON.stringify(error?.response?.data || error?.code)}`)
      throw new Error(`Error when get study ${id}`)
    }
  }

  async getDatasets(): Promise<IPortalDataset[]> {
    try {
      const options = await this.getRequestConfig()
      const result = await this.channel.get(`${this.baseURL}/dataset/list/systemadmin`, options)
      return result.data
    } catch (error) {
      this.logger.error('Error getting studies', error?.response?.data || error?.code)
      throw new Error('Error getting studies')
    }
  }

  async getTenants(): Promise<ITenant[]> {
    try {
      const options = await this.getRequestConfig()
      const result = await this.channel.get(`${this.baseURL}/tenant/list`, options)
      return result.data
    } catch (error) {
      this.logger.error('Error getting tenants', error?.response?.data || error?.code)
      throw new Error('Error getting tenants')
      //return [{ id: "e0348e4d-2e17-43f2-a3c6-efd752d17c23", name: "Tenant" }]
    }
  }

  async getPublicDatasets() {
    try {
      const options = await this.getRequestConfig()
      const result = await this.channel.get(`${this.baseURL}/dataset/public/list`, options)
      return result.data
    } catch (error) {
      this.logger.error('Error getting datasets', error?.response?.data || error?.code)
      throw new Error('Error getting datasets')
    }
  }
}
