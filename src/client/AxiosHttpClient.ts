import {
  AppError,
  Either,
  type HttpPayload,
  type IHttpClient,
  type IHttpClientConfig,
  type IHttpRequestOptions,
  type JsonValue,
} from '@mr-tick/sdk'
import axios, { type AxiosRequestConfig } from 'axios'

export class AxiosHttpClient implements IHttpClient {
  constructor(private readonly config: IHttpClientConfig = {}) {}

  withConfig(config: IHttpClientConfig): AxiosHttpClient {
    return new AxiosHttpClient({
      ...this.config,
      ...config,
      headers: { ...this.config.headers, ...config.headers },
      params: { ...this.config.params, ...config.params },
    })
  }

  private async request<T extends JsonValue>(
    method: string,
    url: string,
    options: IHttpRequestOptions<T>,
    data?: HttpPayload,
  ): Promise<Either<AppError, T>> {
    const config: AxiosRequestConfig<HttpPayload> = {
      method,
      url,
      data,
      baseURL: this.config.baseURL,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mr-tickApp/1.0',
        ...this.config.headers,
        ...options.headers,
      },
      params: { ...this.config.params, ...options.params },
      responseType: options.responseType,
    }
    if (this.config.timeout !== undefined) config.timeout = this.config.timeout
    if (options.timeout !== undefined) config.timeout = options.timeout
    try {
      const response = await axios.request<JsonValue>(config)
      if (!options.responseValidator(response.data))
        return Either.failure(AppError.ValidationError('HTTP_RESPONSE_INVALID'))
      return Either.success(response.data)
    } catch (error) {
      if (!axios.isAxiosError<JsonValue>(error))
        return Either.failure(AppError.Internal('HTTP_REQUEST_FAILED'))
      const status = error.response?.status
      let message = error.message
      const payload = error.response?.data
      if (
        payload !== null &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        typeof payload.message === 'string'
      )
        message = payload.message
      if (status !== undefined)
        return Either.failure(AppError.Http(status, message))
      return Either.failure(AppError.Http(503, message))
    }
  }

  get<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request('GET', url, config)
  }

  post<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request('POST', url, config, data)
  }

  put<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request('PUT', url, config, data)
  }

  patch<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request('PATCH', url, config, data)
  }

  delete<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request('DELETE', url, config)
  }
}
