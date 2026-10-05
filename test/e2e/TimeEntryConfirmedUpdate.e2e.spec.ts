import { createServer, Server } from 'node:http'

import { TimeEntryDTO } from '@mr-tick/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import { RedmineTimeEntryProvider } from '../../src/datasource/versions/3.4/RedmineTimeEntryProvider'
import { RedmineTimeEntryAPI } from '../../src/types/redmine'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

describe('E2E do conector: confirmação de PUT separada da leitura canônica', () => {
  let server: Server
  let provider: RedmineTimeEntryProvider
  let stored: RedmineTimeEntryAPI
  const methods: string[] = []
  const entry: TimeEntryDTO = {
    id: '501', task: { id: '101' }, activity: { id: '9' }, user: { id: '1' },
    timeSpent: 1.3333, comments: 'saved', startDate: new Date(2026, 8, 24, 8),
    createdAt: new Date('2026-09-24T11:00:00Z'), updatedAt: new Date('2026-09-24T11:00:00Z'),
  }

  beforeEach(async () => {
    methods.length = 0
    let reads = 0
    stored = {
      id: 501, project: { id: 1, name: 'Project' }, issue: { id: 101 },
      user: { id: 1, name: 'User' }, activity: { id: 9, name: 'Development' },
      hours: 1, comments: 'before', spent_on: '2026-09-24',
      created_on: '2026-09-24T11:00:00Z', updated_on: '2026-09-24T11:00:00Z',
    }
    server = createServer((request, response) => {
      if (request.url !== '/time_entries/501.json') {
        response.writeHead(404).end()
        return
      }
      if (request.method) methods.push(request.method)
      if (request.method === 'PUT') {
        request.resume()
        request.on('end', () => {
          stored = { ...stored, hours: 1.33, comments: 'saved', updated_on: '2026-09-24T11:00:05Z' }
          response.writeHead(204).end()
        })
        return
      }
      if (request.method !== 'GET') {
        response.writeHead(405).end()
        return
      }
      reads++
      response.setHeader('Content-Type', 'application/json')
      if (reads === 1) {
        response.writeHead(503).end(JSON.stringify({ errors: ['CANONICAL_READ_UNAVAILABLE'] }))
        return
      }
      response.end(JSON.stringify({ time_entry: stored }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    expect(address).not.toBeNull()
    if (!address || typeof address === 'string') return
    provider = new RedmineTimeEntryProvider(new RedmineClient(new AxiosHttpClient(), {
      apiUrl: 'http://127.0.0.1:' + address.port, apiKey: 'local-test-only',
    }))
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('preserva o PUT204 confirmado quando a primeira leitura falha e recupera por GET sem regravar', async () => {
    const write = await provider.update(entry)
    expect(stored.hours).toBe(1.33)
    expect(write.isSuccess()).toBe(true)
    if (write.isFailure()) return
    expect(write.success).toEqual({ id: '501' })
    expect(methods).toEqual(['PUT'])

    const firstRead = await provider.findById(write.success.id)
    expect(firstRead.isFailure()).toBe(true)
    if (firstRead.isSuccess()) return
    expect(firstRead.failure.statusCode).toBe(503)
    expect(firstRead.failure.messageKey).toBe('Request failed with status code 503')

    const recovery = await provider.findById(write.success.id)
    expect(recovery.isSuccess()).toBe(true)
    if (recovery.isFailure()) return
    expect(recovery.success).toMatchObject({
      id: '501', timeSpent: 1.33, comments: 'saved',
      startDate: new Date(2026, 8, 24, 12), updatedAt: new Date(stored.updated_on),
    })
    expect(methods).toEqual(['PUT', 'GET', 'GET'])
  })
})
