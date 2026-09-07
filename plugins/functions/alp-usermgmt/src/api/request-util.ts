import axios, { AxiosRequestConfig } from "../../../_shared/_axios.ts"
import { createLogger } from '../Logger'

const logger = createLogger()
axios.defaults.timeout = 30000

axios.interceptors.response.use(
  response => {
    return response
  },
  error => {
    logger.error(
      `${error?.config?.method} ${error?.config?.url} ${error?.response?.status} ${error?.response?.statusText}`
    )
    throw error
  }
)

export const get = <T = any>(url: string, config?: AxiosRequestConfig) => {
  return axios.get<T>(url, config)
}

export const post = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => {
  return axios.post<T>(url, data, config)
}

export const put = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => {
  return axios.put<T>(url, data, config)
}

export const patch = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => {
  return axios.patch<T>(url, data, config)
}

export const del = <T = any>(url: string, config?: AxiosRequestConfig) => {
  return axios.delete<T>(url, config)
}
