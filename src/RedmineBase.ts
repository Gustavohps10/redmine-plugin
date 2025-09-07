import { Context } from '@timelapse/sdk'
import axios, { AxiosInstance } from 'axios'

export abstract class RedmineBase {
  private apiClient: AxiosInstance | null = null
  private cachedApiKey: string | null = null

  constructor(protected readonly context: Context) {}

  protected getAuthenticatedClient(): AxiosInstance {
    console.log('CONTEXT', this.context)
    const apiUrl = this.context?.config?.apiUrl

    const apiKey: string = this.context.credentials?.apiKey as string

    if (this.apiClient && this.cachedApiKey === apiKey) {
      return this.apiClient
    }

    if (!apiUrl || !apiKey) {
      throw new Error('Nao achou API URL ou KEY PARA BUSCAR DADOS NO REDMINE')
    }

    const headers: Record<string, string> = {
      'X-Redmine-API-Key': apiKey,
    }

    this.apiClient = axios.create({
      baseURL: apiUrl,
      headers,
    })

    this.cachedApiKey = apiKey

    return this.apiClient
  }
}
