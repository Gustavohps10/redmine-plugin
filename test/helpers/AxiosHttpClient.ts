import { AppError, Either, IHttpClient, IHttpClientConfig } from '@mr-tick/sdk'
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'

export class AxiosHttpClient implements IHttpClient {
  private axiosInstance: AxiosInstance
  private defaultParams: Record<string, string> = {}
  private defaultHeaders: Record<string, string> = {}

  constructor(config?: IHttpClientConfig) {
    if (config && config.params) {
      this.defaultParams = config.params
    }
    if (config && config.headers) {
      this.defaultHeaders = config.headers
    }

    let baseURL: string | undefined = undefined
    if (config && config.baseURL !== undefined) {
      baseURL = config.baseURL
    }
    let timeout = 15000
    if (config && config.timeout !== undefined) {
      timeout = config.timeout
    }

    this.axiosInstance = axios.create({
      baseURL,
      timeout,
      headers: {
        ...this.defaultHeaders,
      },
    })
  }

  public withConfig(config: IHttpClientConfig): AxiosHttpClient {
    const nextHeaders: Record<string, string> = { ...this.defaultHeaders }
    if (config.headers) {
      for (const key of Object.keys(config.headers)) {
        const val = config.headers[key]
        if (val !== undefined) {
          nextHeaders[key] = val
        }
      }
    }

    const nextParams: Record<string, string> = { ...this.defaultParams }
    if (config.params) {
      for (const key of Object.keys(config.params)) {
        const val = config.params[key]
        if (val !== undefined) {
          nextParams[key] = val
        }
      }
    }

    let nextBaseURL = this.axiosInstance.defaults.baseURL
    if (config.baseURL !== undefined) {
      nextBaseURL = config.baseURL
    }

    let nextTimeout = 15000
    if (typeof this.axiosInstance.defaults.timeout === 'number' && this.axiosInstance.defaults.timeout > 0) {
      nextTimeout = this.axiosInstance.defaults.timeout
    }
    if (config.timeout !== undefined) {
      nextTimeout = config.timeout
    }

    return new AxiosHttpClient({
      baseURL: nextBaseURL,
      timeout: nextTimeout,
      headers: nextHeaders,
      params: nextParams,
    })
  }

  public configure(config: IHttpClientConfig): void {
    if (config.params) this.defaultParams = config.params
    if (config.headers) this.defaultHeaders = config.headers

    let timeout = 15000
    if (config.timeout !== undefined) {
      timeout = config.timeout
    }

    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout,
      headers: {
        ...this.defaultHeaders,
      },
    })
  }

  private mergeConfig(config?: AxiosRequestConfig): AxiosRequestConfig {
    let params = this.defaultParams
    if (config && config.params) {
      params = { ...this.defaultParams, ...config.params }
    }
    const headers = { ...this.defaultHeaders }
    if (config && config.headers) {
      for (const key of Object.keys(config.headers)) {
        const val = config.headers[key]
        if (typeof val === 'string') {
          headers[key] = val
        }
      }
    }

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
