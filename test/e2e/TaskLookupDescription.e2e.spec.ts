import { createServer, type Server } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import { RedmineTaskProvider } from '../../src/datasource/versions/3.4/RedmineTaskProvider'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

describe('Task lookup response validation over HTTP', () => {
  let server: Server
  let provider: RedmineTaskProvider
  let description: string | number | null | undefined

  beforeEach(async () => {
    description = null
    server = createServer((request, response) => {
      const issue = {
        id: 76314,
        project: { id: 1, name: 'Test project' },
        status: { id: 1, name: 'Open' },
        subject: 'Task without description',
        description,
        created_on: '2026-11-03T10:00:00Z',
        updated_on: '2026-11-03T10:00:00Z',
      }
      response.setHeader('Content-Type', 'application/json')
      if (request.url?.startsWith('/issues.json')) {
        response.end(
          JSON.stringify({
            issues: [issue],
            total_count: 1,
            offset: 0,
            limit: 50,
          }),
        )
        return
      }
      response.end(JSON.stringify({ issue }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('TEST_SERVER_UNAVAILABLE')
    provider = new RedmineTaskProvider(
      new RedmineClient(new AxiosHttpClient(), {
        apiUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'test-key',
      }),
    )
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('looks up an ID when the Redmine description is null', async () => {
    const result = await provider.findById('76314')
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return expect.fail(result.failure.messageKey)
    expect(result.success?.id).toBe('76314')
    expect(result.success?.title).toBe('Task without description')
    expect(result.success?.description).toBeUndefined()
  })

  it('accepts a null description inside a search result page', async () => {
    const result = await provider.findAll({
      search: 'Task without description',
    })
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return expect.fail(result.failure.messageKey)
    expect(result.success.items).toEqual([
      expect.objectContaining({ id: '76314' }),
    ])
  })

  it.each(['Description text', '', undefined])(
    'keeps accepting description %s',
    async (value) => {
      description = value
      expect((await provider.findById('76314')).isSuccess()).toBe(true)
    },
  )

  it('still rejects an invalid description type', async () => {
    description = 123
    const result = await provider.findById('76314')
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess())
      return expect.fail('Expected invalid payload to fail')
    expect(result.failure.messageKey).toBe('HTTP_RESPONSE_INVALID')
  })
})
