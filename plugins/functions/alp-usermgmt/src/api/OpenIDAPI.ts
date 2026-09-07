import { AxiosResponse } from "../../../_shared/_axios.ts"
import jwt from 'jsonwebtoken'
import https from 'https'
import { post } from './request-util'

interface IClientMetadata {
  issuerUrl: string
}

export interface IClientCredentials {
  clientId: string
  clientSecret: string
  scope: string
  resource?: string
}

interface ITokenResponse {
  access_token: string
}

export class OpenIDAPI {
  private readonly issuerUrl: string
  private readonly httpsAgent: https.Agent

  constructor({ issuerUrl }: IClientMetadata) {
    this.issuerUrl = issuerUrl.endsWith('/') ? issuerUrl : `${issuerUrl}/`

    // this.httpsAgent = new https.Agent({
    //   rejectUnauthorized: this.issuerUrl.startsWith('https://alp-logto-') ? false : true
    // })
  }

  async getClientCredentialsToken({ clientId, clientSecret, scope, resource }: IClientCredentials) {
    const params: any = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      resource
    }

    const body = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&')

    let result: AxiosResponse<ITokenResponse> | undefined
    try {
      result = await post<ITokenResponse>(`${this.issuerUrl}token`, body, {
        // httpsAgent: this.httpsAgent,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
    } catch (err) {
      console.error('Error when getting client credentials token', err)
    }

    return result?.data
  }

  isTokenExpiredOrEmpty(token?: string) {
    if (!token) {
      return true
    } else {
      const decodedToken = jwt.decode(token) as jwt.JwtPayload
      return decodedToken?.exp && decodedToken.exp < Date.now() / 1000
    }
  }
}
