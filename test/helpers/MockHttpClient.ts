import { AppError, Either, IHttpClient, IHttpClientConfig } from '@mr-tick/sdk'

export class MockHttpClient implements IHttpClient {
  public configuredConfig: IHttpClientConfig | null = null
  private responses: Record<string, string> = {}
  private statusCodes: Record<string, number> = {}
  private errorMessages: Record<string, string> = {}

  public configure(config: IHttpClientConfig): void {
    this.configuredConfig = config
  }

  public setRoute(
    method: string,
    url: string,
    statusCode: number,
    body: object | string = {},
    errorMessage?: string,
  ): void {
    const key = `${method.toUpperCase()}:${url}`
    this.statusCodes[key] = statusCode
    this.responses[key] = JSON.stringify(body)
    if (errorMessage) this.errorMessages[key] = errorMessage
  }

  public async get<T>(url: string): Promise<Either<AppError, T>> {
    return this.dispatch<T>('GET', url)
  }

  public async post<T>(url: string): Promise<Either<AppError, T>> {
    return this.dispatch<T>('POST', url)
  }

  public async put<T>(url: string): Promise<Either<AppError, T>> {
    return this.dispatch<T>('PUT', url)
  }

  public async patch<T>(url: string): Promise<Either<AppError, T>> {
    return this.dispatch<T>('PATCH', url)
  }

  public async delete<T>(url: string): Promise<Either<AppError, T>> {
    return this.dispatch<T>('DELETE', url)
  }

  private dispatch<T>(method: string, url: string): Either<AppError, T> {
    const key = `${method.toUpperCase()}:${url}`
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
    if (!raw) return Either.failure(AppError.NotFound(`Route not mocked: ${key}`))

    const parsed: T = JSON.parse(raw)
    return Either.success(parsed)
  }
}
