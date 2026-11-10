import { AppError, Either, IHttpClient, JsonValue } from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import { BoundedAnalyticsHttpClient } from '../src/analytics/BoundedAnalyticsHttpClient'
import { InFlightRequests } from '../src/client/InFlightRequests'
import { MockHttpClient } from './helpers/MockHttpClient'

function barrier() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
describe('In-flight request identity', () => {
  it('does not collide when a filter value contains query separators', () => {
    expect(
      InFlightRequests.keyFor('/issues.json', { q: 'x&user_id=2' }),
    ).not.toBe(
      InFlightRequests.keyFor('/issues.json', { q: 'x', user_id: '2' }),
    )
  })
  it('coalesces only pending identical calls and releases after success/failure', async () => {
    const pending = new InFlightRequests<PromiseSettledResult<number>>()
    const release = barrier()
    const work = vi.fn(async () => {
      await release.promise
      return { status: 'fulfilled' as const, value: 1 }
    })
    const one = pending.run('same', work)
    const two = pending.run('same', work)
    expect(work).toHaveBeenCalledTimes(1)
    release.resolve()
    expect(await one).toEqual(await two)
    await pending.run('same', work)
    expect(work).toHaveBeenCalledTimes(2)
  })
})

describe('Private analytics HTTP budget', () => {
  it('serializes analytics and preserves the independent personal transport', async () => {
    const http = new MockHttpClient()
    const entered = barrier(),
      release = barrier()
    const get = vi.spyOn(http, 'get').mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return Either.success('value')
    })
    const analytics = BoundedAnalyticsHttpClient.create(http)
    const validator = (value: JsonValue): value is string =>
      typeof value === 'string'
    const first = analytics.get('/analytics', { responseValidator: validator })
    await entered.promise
    const second = analytics.get('/next', { responseValidator: validator })
    expect(get).toHaveBeenCalledTimes(1)
    const personalClient: IHttpClient = http
    const personal = personalClient.get('/personal', {
      responseValidator: validator,
    })
    expect(get).toHaveBeenCalledTimes(2)
    release.resolve()
    expect((await first).isSuccess()).toBe(true)
    expect((await second).isSuccess()).toBe(true)
    await personal
    expect(get).toHaveBeenCalledTimes(3)
    expect(get).toHaveBeenNthCalledWith(
      1,
      '/analytics',
      expect.objectContaining({ timeout: 30000 }),
    )
    expect(get).toHaveBeenNthCalledWith(
      3,
      '/next',
      expect.objectContaining({ timeout: 30000 }),
    )
  })
  it('rejects queue overflow and oversized responses explicitly', async () => {
    const http = new MockHttpClient()
    const release = barrier(),
      entered = barrier()
    vi.spyOn(http, 'get').mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return Either.success('x')
    })
    const analytics = BoundedAnalyticsHttpClient.create(http)
    const validator = (value: JsonValue): value is string =>
      typeof value === 'string'
    const requests = [
      analytics.get('/active', { responseValidator: validator }),
    ]
    await entered.promise
    for (let index = 0; index < 8; index += 1)
      requests.push(analytics.get('/queued', { responseValidator: validator }))
    const overflow = await analytics.get('/overflow', {
      responseValidator: validator,
    })
    expect(overflow.isFailure()).toBe(true)
    expect(overflow.failure.statusCode).toBe(429)
    release.resolve()
    await Promise.all(requests)
    vi.spyOn(http, 'get').mockResolvedValue(Either.success('x'.repeat(2097153)))
    expect(
      (
        await analytics.get('/large', { responseValidator: validator })
      ).isFailure(),
    ).toBe(true)
  })
  it('releases its slot after a transport failure and prohibits mutations', async () => {
    const http = new MockHttpClient()
    vi.spyOn(http, 'get')
      .mockResolvedValueOnce(Either.failure(AppError.Http(503, 'unavailable')))
      .mockResolvedValueOnce(Either.success('recovered'))
    const analytics = BoundedAnalyticsHttpClient.create(http)
    const validator = (value: JsonValue): value is string =>
      typeof value === 'string'
    expect(
      (
        await analytics.get('/broken', { responseValidator: validator })
      ).isFailure(),
    ).toBe(true)
    expect(
      (await analytics.get('/ok', { responseValidator: validator })).success,
    ).toBe('recovered')
    expect(
      (
        await analytics.post('/write', {}, { responseValidator: validator })
      ).isFailure(),
    ).toBe(true)
  })
})
