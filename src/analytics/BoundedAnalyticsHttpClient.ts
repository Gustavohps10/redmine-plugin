import {
  AppError,
  Either,
  HttpPayload,
  IHttpClient,
  IHttpClientConfig,
  IHttpRequestOptions,
  JsonValue,
} from '@mr-tick/sdk'

interface Budget {
  active: boolean
  waiters: Array<() => void>
  blockedUntil: number
  consecutiveRateLimits: number
}

function rateLimitDeadline(
  error: AppError,
  now: number,
  attempts: number,
): number {
  const value = error
    .getFieldErrors('retryAfter')
    .find((header) => header.trim() !== '')

  if (value !== undefined) {
    if (/^\d+$/.test(value.trim())) {
      const deadline = now + Number(value) * 1000
      if (Number.isSafeInteger(deadline)) return deadline
    }

    const date = Date.parse(value)
    if (Number.isFinite(date)) return Math.max(now, date)
  }

  return now + Math.min(60_000, 1000 * 2 ** attempts)
}

/** This budget is private to analytics; personal clients and their requests are untouched. */
export class BoundedAnalyticsHttpClient implements IHttpClient {
  private constructor(
    private readonly inner: IHttpClient,
    private readonly budget: Budget,
  ) {}

  public static create(inner: IHttpClient): BoundedAnalyticsHttpClient {
    return new BoundedAnalyticsHttpClient(inner, {
      active: false,
      waiters: [],
      blockedUntil: 0,
      consecutiveRateLimits: 0,
    })
  }

  public withConfig(config: IHttpClientConfig): IHttpClient {
    return new BoundedAnalyticsHttpClient(
      this.inner.withConfig({ ...config, timeout: 30000 }),
      this.budget,
    )
  }

  public async get<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    if (this.budget.active) {
      if (this.budget.waiters.length >= 8)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_REQUEST_QUEUE_LIMIT'),
        )
      await new Promise<void>((resolve) => this.budget.waiters.push(resolve))
    }
    this.budget.active = true

    try {
      const now = Date.now()
      if (now < this.budget.blockedUntil)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_RATE_LIMIT_DEFERRED', {
            retryAfter: [
              String(Math.ceil((this.budget.blockedUntil - now) / 1000)),
            ],
          }),
        )

      const result = await this.inner.get(url, { ...config, timeout: 30000 })

      if (result.isFailure() && result.failure.statusCode === 429) {
        this.budget.blockedUntil = rateLimitDeadline(
          result.failure,
          Date.now(),
          this.budget.consecutiveRateLimits,
        )
        this.budget.consecutiveRateLimits += 1
      }

      if (result.isFailure()) return result.forwardFailure()
      this.budget.consecutiveRateLimits = 0
      let payload = JSON.stringify(result.success)
      if (typeof result.success === 'string') payload = result.success
      if (Buffer.byteLength(payload, 'utf8') > 2097152)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_RESPONSE_BYTES_LIMIT'),
        )
      return result
    } finally {
      const next = this.budget.waiters.shift()
      if (next !== undefined) next()
      if (next === undefined) this.budget.active = false
    }
  }

  public async post<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    void url
    void data
    void config
    return Either.failure(AppError.Http(403, 'ANALYTICS_READ_ONLY'))
  }

  public async put<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    void url
    void data
    void config
    return Either.failure(AppError.Http(403, 'ANALYTICS_READ_ONLY'))
  }

  public async patch<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    void url
    void data
    void config
    return Either.failure(AppError.Http(403, 'ANALYTICS_READ_ONLY'))
  }

  public async delete<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    void url
    void config
    return Either.failure(AppError.Http(403, 'ANALYTICS_READ_ONLY'))
  }
}
