import { createServer, Server } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import { RedmineTimeEntryProvider } from '../../src/datasource/versions/3.4/RedmineTimeEntryProvider'
import { RedmineTimeEntryAPI } from '../../src/types/redmine'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

describe('E2E HTTP: apontamento sem issue preserva o projeto', () => {
  let server: Server
  let provider: RedmineTimeEntryProvider
  let stored: RedmineTimeEntryAPI
  const writes: string[] = []

  beforeEach(async () => {
    writes.length = 0
    stored = {
      id: 501, project: { id: 17, name: 'Project' },
      user: { id: 1, name: 'User' }, activity: { id: 9, name: 'Development' },
      hours: 1, comments: 'before', spent_on: '2026-10-04',
      created_on: '2026-10-04T12:00:00Z', updated_on: '2026-10-04T12:00:00Z',
    }
    server = createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json')
      if (request.method === 'GET') {
        response.end(JSON.stringify({ time_entry: stored }))
        return
      }
      let body = ''
      request.on('data', (chunk: Buffer) => { body += chunk.toString() })
      request.on('end', () => {
        writes.push(body)
        const issueId = body.match(/"issue_id":(\d+)/)?.[1]
        if (issueId) stored.issue = { id: Number(issueId) }
        stored.comments = 'edited'
        stored.hours = 2
        if (request.method === 'POST') {
          response.writeHead(201).end(JSON.stringify({ time_entry: stored }))
          return
        }
        response.writeHead(204).end()
      })
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
  it('editar comentário e horas não associa o projeto17 à issue17', async () => {
    const read = await provider.findById('501')
    expect(read.isSuccess()).toBe(true)
    if (read.isFailure() || !read.success) return
    const result = await provider.update({ ...read.success, comments: 'edited', timeSpent: 2 })
    expect(result.isSuccess()).toBe(true)
    expect(stored.issue).toBeUndefined()
    expect(writes).toHaveLength(1)
    expect(writes[0]).not.toContain('"issue_id"')
    expect(read.success.task.id).toBe('')
    expect(stored.hours).toBe(2)
    expect(stored.comments).toBe('edited')
  })
  it('seleção explícita de uma issue real altera o vínculo', async () => {
    const read = await provider.findById('501')
    if (read.isFailure() || !read.success) return
    const result = await provider.update({ ...read.success, task: { id: '101' } })
    expect(result.isSuccess()).toBe(true)
    expect(stored.issue?.id).toBe(101)
  })
  it('criação sem tarefa é rejeitada antes de qualquer POST', async () => {
    const read = await provider.findById('501')
    if (read.isFailure() || !read.success) return
    const result = await provider.create({ ...read.success, id: undefined, task: { id: '' } })
    expect(result.isFailure()).toBe(true)
    expect(writes).toHaveLength(0)
  })
})
