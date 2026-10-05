import { AppError, Either, IHttpClient, IHttpClientConfig } from '@mr-tick/sdk'
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'

export class AxiosHttpClient implements IHttpClient {
  private axiosInstance: AxiosInstance
  private defaultParams: Record<string, string> = {}
  private defaultHeaders: Record<string, string> = {}

  constructor() {
    this.axiosInstance = axios.create()
  }

  public configure(config: IHttpClientConfig): void {
    if (config.params) this.defaultParams = config.params
    if (config.headers) this.defaultHeaders = config.headers

    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ? config.timeout : 15000,
      headers: {
        ...this.defaultHeaders,
      },
    })
  }

  private mergeConfig(config?: AxiosRequestConfig): AxiosRequestConfig {
    const params = config?.params
      ? { ...this.defaultParams, ...config.params }
      : this.defaultParams
    const headers = config?.headers
      ? { ...this.defaultHeaders, ...config.headers }
      : this.defaultHeaders

    return {
      ...config,
      params,
      headers,
    }
  }

  public async get<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.get<T>(
        url,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      if (axios.isAxiosError(error)) return this.handleAxiosError(error)
      if (error instanceof Error) return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal(String(error)))
    }
  }

  public async post<T>(
    url: string,
    data?: object,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.post<T>(
        url,
        data,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      if (axios.isAxiosError(error)) return this.handleAxiosError(error)
      if (error instanceof Error) return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal(String(error)))
    }
  }

  public async put<T>(
    url: string,
    data?: object,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.put<T>(
        url,
        data,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      if (axios.isAxiosError(error)) return this.handleAxiosError(error)
      if (error instanceof Error) return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal(String(error)))
    }
  }

  public async patch<T>(
    url: string,
    data?: object,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.patch<T>(
        url,
        data,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      if (axios.isAxiosError(error)) return this.handleAxiosError(error)
      if (error instanceof Error) return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal(String(error)))
    }
  }

  public async delete<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.delete<T>(
        url,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      if (axios.isAxiosError(error)) return this.handleAxiosError(error)
      if (error instanceof Error) return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal(String(error)))
    }
  }

  private handleAxiosError(error: AxiosError): Either<AppError, never> {
    const status = error.response?.status
    const message = error.message

    if (status === 401) return Either.failure(AppError.Unauthorized(message))
    if (status === 403) return Either.failure(AppError.Http(403, message))
    if (status === 404) return Either.failure(AppError.NotFound(message))
    if (status === 422) return Either.failure(AppError.ValidationError(message))

    if (status !== undefined) return Either.failure(AppError.Http(status, message))
    return Either.failure(AppError.Internal(message))
  }
}
