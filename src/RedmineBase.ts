 
import type { DataSourceContext, IHttpClient } from '@metric-org/sdk'

export abstract class RedmineBase {
  protected httpClient: IHttpClient

  constructor(protected readonly context: DataSourceContext) {
    this.httpClient = context.httpClient
  }

  protected getHttpClient(): IHttpClient {
    const apiUrl = (this.context?.config?.apiUrl as string) || ''
    const apiKey = (this.context?.credentials?.apiKey as string) || ''

    if (!apiUrl) {
      throw new Error('Nao achou API URL PARA BUSCAR DADOS NO REDMINE')
    }

    this.httpClient.configure({
      baseURL: apiUrl,
      headers: apiKey
        ? {
            'X-Redmine-API-Key': apiKey,
          }
        : undefined,
    })

    return this.httpClient
  }
}
