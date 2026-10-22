import { createServer, type Server } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AxiosHttpClient } from '../src/client/AxiosHttpClient'
import { RedmineClient } from '../src/client/RedmineClient'
import { RedmineTimeEntryProvider } from '../src/datasource'
import { RedmineMemberProvider } from '../src/datasource'
import issuesFixture from './fixtures/issues.json'
import timeEntriesFixture from './fixtures/time_entries.json'
import userFixture from './fixtures/user.json'

describe('SDK 0.10 HTTP response validation', () => {
  let server: Server
  let client: RedmineClient
  let responseBody = ''
  let responseStatus = 200

  beforeEach(async () => {
    responseBody = JSON.stringify(userFixture)
    responseStatus = 200
    server = createServer((request, response) => {
      response.writeHead(responseStatus, { 'Content-Type': 'application/json' })
      response.end(responseBody)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Server address unavailable')
    client = new RedmineClient(new AxiosHttpClient(), {
      apiUrl: 'http://127.0.0.1:' + address.port,
      apiKey: 'test-key',
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      }),
    )
  })

  it('accepts a valid user response', async () => {
    const result = await client.getCurrentUser()
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess())
      expect(result.success.user.id).toBe(userFixture.user.id)
  })

  it.each([
    { user: { ...userFixture.user, id: 'invalid' } },
    {
      user: {
        ...userFixture.user,
        custom_fields: [{ id: 1, name: 'bad', value: 123 }],
      },
    },
    { user: null },
  ])(
    'rejects malformed user responses at the transport boundary: %j',
    async (body) => {
      responseBody = JSON.stringify(body)
      const result = await client.getCurrentUser()
      expect(result.isFailure()).toBe(true)
      if (result.isFailure())
        expect(result.failure.messageKey).toBe('HTTP_RESPONSE_INVALID')
    },
  )

  it('accepts nullable issue dates and estimates', async () => {
    responseBody = JSON.stringify({
      ...issuesFixture,
      issues: issuesFixture.issues.map((issue) => ({
        ...issue,
        start_date: null,
        due_date: null,
        estimated_hours: null,
      })),
    })
    const result = await client.listIssues({})
    expect(result.isSuccess()).toBe(true)
  })

  it('accepts users whose login is hidden and last login is null', async () => {
    const { login, ...visibleUser } = userFixture.user
    responseBody = JSON.stringify({
      user: { ...visibleUser, last_login_on: null },
    })
    const result = await new RedmineMemberProvider(client).findById('1')
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success?.login).toBe('')
      expect(result.success?.lastLoginOn).toBe('')
    }
    expect(login).toBe('admin')
  })

  it('preserves forbidden status and server message', async () => {
    responseStatus = 403
    responseBody = JSON.stringify({ message: 'Project access denied' })
    const result = await client.getCurrentUser()
    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(403)
      expect(result.failure.messageKey).toBe('Project access denied')
    }
  })

  it('pulls entries with null comments through the real HTTP transport', async () => {
    const entries = timeEntriesFixture.time_entries.map((entry) => ({
      ...entry,
      comments: null,
    }))
    responseBody = JSON.stringify({
      time_entries: entries,
      total_count: entries.length,
      offset: 0,
      limit: 100,
    })
    const result = await new RedmineTimeEntryProvider(client).pull(
      '1',
      { updatedAt: new Date(0), id: '' },
      100,
    )
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.items.length).toBeGreaterThan(0)
      expect(result.success.items.map((entry) => entry.id).sort()).toEqual(
        entries.map((entry) => String(entry.id)).sort(),
      )
      expect(
        result.success.items.every(
          (entry) => entry.correlationId === undefined,
        ),
      ).toBe(true)
      expect(
        result.success.items.every((entry) => entry.comments === undefined),
      ).toBe(true)
    }
  })

  it('rejects malformed nested time entries', async () => {
    responseBody = JSON.stringify({
      time_entries: [{ id: 1, project: { id: 'bad', name: 'Project' } }],
      total_count: 1,
      offset: 0,
      limit: 25,
    })
    const result = await client.listTimeEntries({})
    expect(result.isFailure()).toBe(true)
  })

  it('accepts empty successful update and delete responses', async () => {
    responseStatus = 204
    responseBody = ''
    const update = await client.updateTimeEntry('123', {
      time_entry: { comments: 'updated' },
    })
    const removal = await client.deleteTimeEntry('123')
    expect(update.isSuccess()).toBe(true)
    expect(removal.isSuccess()).toBe(true)
    if (update.isSuccess()) expect(update.success).toBeUndefined()
    if (removal.isSuccess()) expect(removal.success).toBeUndefined()
  })

  it('preserves unauthorized HTTP failures', async () => {
    responseStatus = 401
    responseBody = '{}'
    const result = await client.getCurrentUser()
    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) expect(result.failure.statusCode).toBe(401)
  })
})
