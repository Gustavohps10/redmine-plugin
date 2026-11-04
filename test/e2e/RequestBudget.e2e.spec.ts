import { TimeEntryDTO, TimeEntryPullCheckpointDTO } from '@mr-tick/sdk'
import { createServer, Server } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import { RedmineMetadataProvider } from '../../src/datasource/versions/3.4/RedmineMetadataProvider'
import { RedmineTaskProvider } from '../../src/datasource/versions/3.4/RedmineTaskProvider'
import { RedmineTimeEntryProvider } from '../../src/datasource/versions/3.4/RedmineTimeEntryProvider'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

const ATOM_KEY = 'abcdefghijklmnopqrstuvwxyz012345'
const TOTAL_ENTRIES = 351
const SNAPSHOT_REQUESTS = Math.ceil(TOTAL_ENTRIES / 100)

interface IssueFixture {
  id: number
  subject: string
  description: string | null
  assignedTo: boolean
  updatedOn: string
}

describe('Orçamento de requests do conector Redmine (HTTP real)', () => {
  let server: Server
  let client: RedmineClient
  let hits: Record<string, number>
  let issueQueries: URLSearchParams[]
  let entries: unknown[]
  let issues: IssueFixture[]
  let failTrackers = false

  const count = (path: string): number => hits[path] ?? 0

  beforeEach(async () => {
    hits = {}
    failTrackers = false
    issueQueries = []
    const day = new Date().toISOString().slice(0, 10)
    const base = new Date(`${day}T12:00:00Z`).getTime()
    entries = Array.from({ length: TOTAL_ENTRIES }, (value, index) => ({
      id: index + 1,
      project: { id: 1, name: 'Project' },
      issue: { id: 101 },
      user: { id: 1, name: 'User' },
      activity: { id: 9, name: 'Development' },
      hours: 1,
      comments: `entry-${index + 1}`,
      spent_on: day,
      created_on: new Date(base).toISOString(),
      updated_on: new Date(
        base + Math.floor(index / 4) * 1000,
      ).toISOString(),
    })).reverse()
    issues = [
      {
        id: 10,
        subject: 'Atribuída sem descrição',
        description: null,
        assignedTo: true,
        updatedOn: '2026-11-03T10:00:00Z',
      },
      {
        id: 45,
        subject: 'Tarefa de colega com interação',
        description: 'Descrição completa',
        assignedTo: false,
        updatedOn: '2026-11-03T11:00:00Z',
      },
    ]

    const issuePayload = (issue: IssueFixture) => ({
      id: issue.id,
      project: { id: 1, name: 'Projeto' },
      tracker: { id: 1, name: 'Bug' },
      status: { id: 1, name: 'Nova' },
      priority: { id: 2, name: 'Normal' },
      author: { id: 5, name: 'Autor' },
      ...(issue.assignedTo ? { assigned_to: { id: 1, name: 'Fulano Silva' } } : {}),
      subject: issue.subject,
      description: issue.description,
      created_on: issue.updatedOn,
      updated_on: issue.updatedOn,
    })

    server = createServer((request, response) => {
      const url = new URL(request.url ? request.url : '/', 'http://localhost')
      hits[url.pathname] = count(url.pathname) + 1
      const json = (body: object) => {
        response.setHeader('Content-Type', 'application/json')
        setTimeout(() => response.end(JSON.stringify(body)), 15)
      }
      if (url.pathname === '/time_entries.json') {
        const offset = Number(url.searchParams.get('offset'))
        const limit = Number(url.searchParams.get('limit'))
        json({
          time_entries: entries.slice(offset, offset + limit),
          total_count: entries.length,
          offset,
          limit,
        })
        return
      }
      if (url.pathname === '/issues.json') {
        issueQueries.push(url.searchParams)
        const ids = url.searchParams.get('issue_id')
        const selected = ids
          ? issues.filter((issue) => ids.split(',').includes(String(issue.id)))
          : issues.filter((issue) => issue.assignedTo)
        json({
          issues: selected.map(issuePayload),
          total_count: selected.length,
          offset: 0,
          limit: 100,
        })
        return
      }
      if (url.pathname === '/users/1.json') {
        json({
          user: {
            id: 1,
            firstname: 'Fulano',
            lastname: 'Silva',
            created_on: '2020-01-01T00:00:00Z',
          },
        })
        return
      }
      if (url.pathname === '/activity.atom') {
        response.setHeader('Content-Type', 'application/atom+xml')
        response.end(
          `<?xml version="1.0"?><feed><entry><id>e1</id><title>Projeto - Bug #45 (Nova): Tarefa de colega com interação</title><updated>2026-11-03T11:00:00Z</updated><author><name>Fulano Silva</name></author><content type="html">comentou</content></entry></feed>`,
        )
        return
      }
      if (url.pathname === '/enumerations/time_entry_activities.json') {
        json({ time_entry_activities: [{ id: 9, name: 'Development' }] })
        return
      }
      if (url.pathname === '/issue_statuses.json') {
        json({ issue_statuses: [{ id: 1, name: 'Nova' }] })
        return
      }
      if (url.pathname === '/enumerations/issue_priorities.json') {
        json({ issue_priorities: [{ id: 2, name: 'Normal' }] })
        return
      }
      if (url.pathname === '/trackers.json') {
        if (failTrackers) {
          response.writeHead(503).end()
          return
        }
        json({ trackers: [{ id: 1, name: 'Bug' }] })
        return
      }
      response.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('TEST_SERVER_UNAVAILABLE')
    client = new RedmineClient(new AxiosHttpClient(), {
      apiUrl: `http://127.0.0.1:${address.port}`,
      apiKey: 'local-test-only',
      atomKey: ATOM_KEY,
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function scan(
    provider: RedmineTimeEntryProvider,
    start: TimeEntryPullCheckpointDTO,
  ) {
    let next = start
    const items: TimeEntryDTO[] = []
    for (let round = 0; round < 30; round++) {
      const result = await provider.pull('1', next, 30)
      if (result.isFailure()) return expect.fail(result.failure.messageKey)
      items.push(...result.success.items)
      next = result.success.checkpoint
      if (!result.success.hasMore) return { items, checkpoint: next }
    }
    return expect.fail('snapshot pagination must finish')
  }

  describe('apontamentos', () => {
    it('um scan completo de 351 registros entrega tudo de forma determinística', async () => {
      const provider = new RedmineTimeEntryProvider(client)
      const result = await scan(provider, { updatedAt: new Date(0), id: '' })

      expect(new Set(result.items.map((entry) => entry.id)).size).toBe(
        TOTAL_ENTRIES,
      )
      // Cada página de 30 itens varre o snapshot no Redmine (12 páginas x 4 requests = 48)
      expect(count('/time_entries.json')).toBe(
        SNAPSHOT_REQUESTS * Math.ceil(TOTAL_ENTRIES / 30),
      )
    })

    it('resync sem mudanças custa exatamente um snapshot e não entrega itens', async () => {
      const provider = new RedmineTimeEntryProvider(client)
      const first = await scan(provider, { updatedAt: new Date(0), id: '' })
      const afterFirst = count('/time_entries.json')

      const resync = await provider.pull('1', first.checkpoint, 30)

      expect(resync.isSuccess()).toBe(true)
      if (resync.isFailure()) return
      expect(resync.success.items).toEqual([])
      expect(resync.success.hasMore).toBe(false)
      expect(count('/time_entries.json') - afterFirst).toBe(SNAPSHOT_REQUESTS)
    })

    it('mudança externa continua detectada no resync seguinte ao scan', async () => {
      const provider = new RedmineTimeEntryProvider(client)
      const first = await scan(provider, { updatedAt: new Date(0), id: '' })
      const target = entries.find(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          'id' in entry &&
          entry.id === 5,
      )
      expect(target).toBeDefined()
      if (typeof target !== 'object' || target === null) return
      Object.assign(target, { comments: 'EXTERNAL_UPDATE' })

      const second = await scan(provider, first.checkpoint)

      expect(
        second.items.find((entry) => entry.id === '5')?.comments,
      ).toBe('EXTERNAL_UPDATE')
      expect(second.items).toHaveLength(TOTAL_ENTRIES)
    })

    it('duas janelas iniciando o mesmo scan ao mesmo tempo compartilham o snapshot', async () => {
      const provider = new RedmineTimeEntryProvider(client)
      const start = { updatedAt: new Date(0), id: '' }

      await Promise.all([
        provider.pull('1', start, 30),
        provider.pull('1', start, 30),
      ])

      expect(count('/time_entries.json')).toBe(SNAPSHOT_REQUESTS)
    })
  })

  describe('metadados', () => {
    it('chamadas repetidas ou simultâneas custam apenas 4 requests', async () => {
      const provider = new RedmineMetadataProvider(client)
      const checkpoint = { updatedAt: new Date(0), id: '' }

      const [first, second] = await Promise.all([
        provider.getMetadata('1', checkpoint, 10),
        provider.getMetadata('1', checkpoint, 10),
      ])
      const third = await provider.getMetadata('1', checkpoint, 10)

      expect(first.isSuccess() && second.isSuccess() && third.isSuccess()).toBe(
        true,
      )
      const total =
        count('/enumerations/time_entry_activities.json') +
        count('/issue_statuses.json') +
        count('/enumerations/issue_priorities.json') +
        count('/trackers.json')
      expect(total).toBe(4)
    })

    it('falha não é cacheada e a próxima chamada tenta de novo', async () => {
      const provider = new RedmineMetadataProvider(client)
      const checkpoint = { updatedAt: new Date(0), id: '' }
      failTrackers = true

      const failed = await provider.getMetadata('1', checkpoint, 10)
      failTrackers = false
      const recovered = await provider.getMetadata('1', checkpoint, 10)
      const cached = await provider.getMetadata('1', checkpoint, 10)

      expect(failed.isFailure()).toBe(true)
      expect(recovered.isSuccess()).toBe(true)
      expect(cached.isSuccess()).toBe(true)
      expect(count('/trackers.json')).toBe(2)
    })
  })

  describe('tarefas', () => {
    const checkpoint = { updatedAt: new Date('2026-09-01T00:00:00Z'), id: '' }

    it('descobre tarefa de colega pelo Atom e enriquece só o ID do Atom', async () => {
      const provider = new RedmineTaskProvider(client)

      const result = await provider.pull('1', checkpoint, 30)

      expect(result.isSuccess()).toBe(true)
      if (result.isFailure()) return
      expect(result.success.map((task) => task.id).sort()).toEqual(['10', '45'])
      expect(
        result.success.find((task) => task.id === '45')?.description,
      ).toBe('Descrição completa')
      const enrichment = issueQueries.filter((query) => query.has('issue_id'))
      expect(enrichment).toHaveLength(1)
      expect(enrichment[0]?.get('issue_id')).toBe('45')
    })

    it('segunda sincronização sem novidades não repete usuário nem enriquecimento', async () => {
      const provider = new RedmineTaskProvider(client)
      const first = await provider.pull('1', checkpoint, 30)
      expect(first.isSuccess()).toBe(true)

      const second = await provider.pull(
        '1',
        { updatedAt: new Date('2026-11-03T12:00:00Z'), id: '45' },
        30,
      )

      expect(second.isSuccess()).toBe(true)
      if (second.isFailure()) return
      expect(second.success).toEqual([])
      expect(count('/users/1.json')).toBe(1)
      expect(
        issueQueries.filter((query) => query.has('issue_id')),
      ).toHaveLength(1)
    })

    it('duas janelas sincronizando tarefas ao mesmo tempo compartilham as chamadas', async () => {
      const provider = new RedmineTaskProvider(client)

      const [first, second] = await Promise.all([
        provider.pull('1', checkpoint, 30),
        provider.pull('1', checkpoint, 30),
      ])

      expect(first.isSuccess() && second.isSuccess()).toBe(true)
      expect(count('/activity.atom')).toBe(1)
      expect(count('/users/1.json')).toBe(1)
      expect(count('/issues.json')).toBe(2)
    })
  })
})
