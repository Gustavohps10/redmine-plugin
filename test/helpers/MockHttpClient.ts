import { AppError, Either, IHttpClient, IHttpClientConfig } from '@mr-tick/sdk'

export interface MockRequestConfig {
  params?: Record<string, string>
  headers?: Record<string, string>
}

export class MockHttpClient implements IHttpClient {
  public configuredConfig: IHttpClientConfig | null = null
  public requests: Array<{
    method: string
    url: string
    params?: Record<string, string>
  }> = []
  private responses: Record<string, string> = {}
  private statusCodes: Record<string, number> = {}
  private errorMessages: Record<string, string> = {}

  public getRequestHistory(): Array<{
    method: string
    url: string
    params?: Record<string, string>
  }> {
    return this.requests
  }

  public clearHistory(): void {
    this.requests = []
  }

  public configure(config: IHttpClientConfig): void {
    this.configuredConfig = config
  }

  private buildKey(
    method: string,
    url: string,
    params?: Record<string, string>,
  ): string {
    const methodUpper = method.toUpperCase()
    if (!params || Object.keys(params).length === 0) return `${methodUpper}:${url}`
    const query = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    return `${methodUpper}:${url}?${query}`
  }

  public setRoute(
    method: string,
    url: string,
    statusCode: number,
    body: object | string = {},
    errorMessage?: string,
    params?: Record<string, string>,
  ): void {
    const key = this.buildKey(method, url, params)
    this.statusCodes[key] = statusCode
    this.responses[key] = JSON.stringify(body)
    if (errorMessage) this.errorMessages[key] = errorMessage
  }

  public async get<T>(
    url: string,
    config?: MockRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.dispatch<T>('GET', url, config?.params)
  }

  public async post<T>(
    url: string,
    body?: object | string,
    config?: MockRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.dispatch<T>('POST', url, config?.params)
  }

  public async put<T>(
    url: string,
    body?: object | string,
    config?: MockRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.dispatch<T>('PUT', url, config?.params)
  }

  public async patch<T>(
    url: string,
    body?: object | string,
    config?: MockRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.dispatch<T>('PATCH', url, config?.params)
  }

  public async delete<T>(
    url: string,
    config?: MockRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.dispatch<T>('DELETE', url, config?.params)
  }

  private dispatch<T>(
    method: string,
    url: string,
    params?: Record<string, string>,
  ): Either<AppError, T> {
    this.requests.push({ method, url, params })
    const exactKey = this.buildKey(method, url, params)
    const baseKey = `${method.toUpperCase()}:${url}`
    const key = this.responses[exactKey] !== undefined ? exactKey : baseKey
    const statusCode = this.statusCodes[key]
    const customMessage = this.errorMessages[key]

    if (statusCode === 401) {
      const message = customMessage ? customMessage : 'UNAUTHORIZED'
      return Either.failure(AppError.Unauthorized(message))
    }

    if (statusCode === 403) {
      const message = customMessage ? customMessage : 'FORBIDDEN'
      return Either.failure(AppError.Forbidden(message))
    }

    if (statusCode === 404) {
      const message = customMessage ? customMessage : 'NOT_FOUND'
      return Either.failure(AppError.NotFound(message))
    }

    if (statusCode === 422) {
      const message = customMessage ? customMessage : 'VALIDATION_ERROR'
      return Either.failure(AppError.ValidationError(message))
    }

    if (statusCode && statusCode >= 500) {
      const message = customMessage ? customMessage : 'INTERNAL_SERVER_ERROR'
      return Either.failure(AppError.Internal(message))
    }

    const raw = this.responses[key]
    if (!raw) return Either.failure(AppError.NotFound(`Route not mocked: ${exactKey}`))

    const parsed: T = JSON.parse(raw)
    return Either.success(parsed)
  }
}
