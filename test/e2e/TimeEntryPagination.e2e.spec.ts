import { TimeEntryDTO, TimeEntryPullCheckpointDTO } from '@mr-tick/sdk'
import { createServer, Server } from 'node:http'

import { beforeEach, afterEach, describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import { RedmineTimeEntryProvider } from '../../src/datasource/versions/3.4/RedmineTimeEntryProvider'
import { RedmineTimeEntryAPI } from '../../src/types/redmine'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

describe('E2E do conector: HTTP real e paginação Redmine', () => {
  let server: Server
  let provider: RedmineTimeEntryProvider
  let client: RedmineClient
  let entries: RedmineTimeEntryAPI[]
  let failOffset: number | undefined
  let corruption: 'duplicate' | 'total' | 'empty' | undefined
  const requests: number[] = []

  beforeEach(async () => {
    requests.length = 0
    failOffset = undefined
    corruption = undefined
    const day = new Date().toISOString().slice(0, 10)
    const base = new Date(day + 'T12:00:00Z').getTime()
    entries = Array.from({ length: 351 }, (value, index) => ({
      id: index + 1,
      project: { id: 1, name: 'Project' },
      issue: { id: 101 },
      user: { id: 1, name: 'User' },
      activity: { id: 9, name: 'Development' },
      hours: 1,
      comments: 'entry-' + (index + 1),
      spent_on: day,
      created_on: new Date(base).toISOString(),
      updated_on: new Date(base + Math.floor(index / 4) * 1000).toISOString(),
    })).reverse()
    server = createServer((request, response) => {
      const url = new URL(request.url ? request.url : '/', 'http://localhost')
      if (url.pathname !== '/time_entries.json') {
        response.writeHead(404).end()
        return
      }
      const offset = Number(url.searchParams.get('offset'))
      const limit = Number(url.searchParams.get('limit'))
      requests.push(offset)
      response.setHeader('Content-Type', 'application/json')
      if (offset === failOffset) {
        response.writeHead(503).end(JSON.stringify({ errors: ['PAGE_UNAVAILABLE'] }))
        return
      }
      const page = offset === 100 && corruption === 'duplicate'
        ? entries.slice(0, limit)
        : entries.slice(offset, offset + limit)
      response.end(JSON.stringify({
        time_entries: offset === 100 && corruption === 'empty' ? [] : page,
        total_count: offset === 100 && corruption === 'total' ? entries.length + 1 : entries.length,
        offset,
        limit,
      }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    expect(address).not.toBeNull()
    if (!address || typeof address === 'string') return
    client = new RedmineClient(new AxiosHttpClient(), {
      apiUrl: 'http://127.0.0.1:' + address.port,
      apiKey: 'local-test-only',
    })
    provider = new RedmineTimeEntryProvider(client)
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function pullAll(checkpoint: TimeEntryPullCheckpointDTO, batch = 30) {
    let next = checkpoint
    const items: TimeEntryDTO[] = []
    for (let round = 0; round < 30; round++) {
      const result = await provider.pull('1', next, batch)
      expect(result.isSuccess()).toBe(true)
      if (result.isFailure()) return { items, checkpoint: next }
      items.push(...result.success.items)
      next = result.success.checkpoint
      if (!result.success.hasMore) return { items, checkpoint: next }
    }
    expect(items.length, 'snapshot pagination must finish').toBeLessThan(0)
    return { items, checkpoint: next }
  }
  it('recebe todos os 351 registros apesar da ordem HTTP e dos timestamps empatados', async () => {
    let checkpoint: TimeEntryPullCheckpointDTO = { updatedAt: new Date(0), id: '' }
    const ids: string[] = []
    for (let batchNumber = 0; batchNumber < 20; batchNumber++) {
      const result = await provider.pull('1', checkpoint, 30)
      expect(result.isSuccess()).toBe(true)
      if (result.isFailure()) return
      const last = result.success.items.at(-1)
      if (!last) break
      ids.push(...result.success.items.flatMap((entry: TimeEntryDTO) => entry.id ? [entry.id] : []))
      if (!last.id) return
      checkpoint = result.success.checkpoint
    }
    expect(ids).toHaveLength(351)
    expect(new Set(ids).size).toBe(351)
    expect(new Set(ids)).toEqual(new Set(entries.map((entry) => String(entry.id))))
    expect(requests).toContain(300)
  })

  it('encontra atualização externa após a terceira página', async () => {
    const before = await pullAll({ updatedAt: new Date(0), id: '' })
    const changed = entries.find((entry) => entry.id === 5)
    expect(changed).toBeDefined()
    if (!changed) return
    changed.updated_on = new Date(before.checkpoint.updatedAt.getTime() + 1000).toISOString()
    changed.comments = 'EXTERNAL_UPDATE'
    const result = await pullAll(before.checkpoint)
    expect(result.items.find((entry) => entry.id === '5')?.comments).toBe('EXTERNAL_UPDATE')
    expect(result.items).toHaveLength(351)
  })
  it('findByMemberId retorna snapshot completo maior que 100 registros', async () => {
    const result = await provider.findByMemberId('1', new Date('2026-01-01'), new Date('2027-01-01'))
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return
    expect(result.success.items).toHaveLength(351)
    expect(result.success.total).toBe(351)
    expect(result.success.page).toBe(1)
    expect(result.success.pageSize).toBe(351)
  })

  it('entrega nova versão do mesmo ID mesmo quando updated_on não muda, inclusive após recriar o provider', async () => {
    const before = await pullAll({ updatedAt: new Date(0), id: '' })
    const changed = entries.find((entry) => entry.id === 351)
    expect(changed).toBeDefined()
    if (!changed) return
    const originalTimestamp = changed.updated_on
    changed.comments = 'CHANGED_WITH_EQUAL_TIMESTAMP'
    changed.hours = 2
    provider = new RedmineTimeEntryProvider(client)
    const result = await pullAll(before.checkpoint)
    expect(result.items.find((entry) => entry.id === '351')).toMatchObject({
      comments: 'CHANGED_WITH_EQUAL_TIMESTAMP', timeSpent: 2,
      updatedAt: new Date(originalTimestamp),
    })
    expect(result.checkpoint.cursor).not.toBe(before.checkpoint.cursor)
    const unchanged = await provider.pull('1', result.checkpoint, 30)
    expect(unchanged.isSuccess()).toBe(true)
    if (unchanged.isFailure()) return
    expect(unchanged.success.items).toEqual([])
    expect(unchanged.success.hasMore).toBe(false)
    expect(unchanged.success.checkpoint).toEqual(result.checkpoint)
  })

  it('mudança entre páginas reinicia o snapshot sem saltar o registro alterado', async () => {
    const first = await provider.pull('1', { updatedAt: new Date(0), id: '' }, 30)
    if (first.isFailure()) return
    expect(first.success.items).toHaveLength(30)
    const changed = entries.find((entry) => entry.id === 1)
    if (!changed) return
    changed.comments = 'CHANGED_DURING_PAGINATION'
    const restarted = await provider.pull('1', first.success.checkpoint, 30)
    expect(restarted.isSuccess()).toBe(true)
    if (restarted.isFailure()) return
    expect(restarted.success.snapshotId).not.toBe(first.success.snapshotId)
    expect(restarted.success.items.at(0)).toMatchObject({ id: '1', comments: changed.comments })
    const rest = await pullAll(restarted.success.checkpoint)
    expect([...restarted.success.items, ...rest.items]).toHaveLength(351)
  })
  it('falha na segunda página impede confirmação de snapshot parcial', async () => {
    failOffset = 100
    const result = await provider.findByMemberId('1', new Date('2026-01-01'), new Date('2027-01-01'))
    expect(result.isFailure()).toBe(true)
    expect(requests).toContain(100)
  })

  it.each(['duplicate', 'total', 'empty'])('rejeita snapshot incoerente (%s) sem avançar o cursor', async (scenario) => {
    if (scenario !== 'duplicate' && scenario !== 'total' && scenario !== 'empty') return
    corruption = scenario
    const checkpoint = { updatedAt: new Date(0), id: '' }
    const failed = await provider.pull('1', checkpoint, 30)
    expect(failed.isFailure()).toBe(true)
    expect(checkpoint).toEqual({ updatedAt: new Date(0), id: '' })
    corruption = undefined
    const recovered = await provider.pull('1', checkpoint, 30)
    expect(recovered.isSuccess()).toBe(true)
    if (recovered.isFailure()) return
    expect(recovered.success.items).toHaveLength(30)
    expect(recovered.success.items.at(0)?.id).toBe('1')
  })

  it.each(['duplicate', 'total', 'empty'])('correlação rejeita snapshot incoerente (%s) antes de concluir ausência ou unicidade', async (scenario) => {
    if (scenario !== 'duplicate' && scenario !== 'total' && scenario !== 'empty') return
    corruption = scenario
    const visible = entries.find((entry) => entry.id === 351)
    const hidden = entries.find((entry) => entry.id === 1)
    expect(visible).toBeDefined()
    expect(hidden).toBeDefined()
    if (!visible || !hidden) return
    visible.comments = 'saved [mc:recovery-id]'
    hidden.comments = 'other [mc:recovery-id]'
    const input = {
      task: { id: '101' }, activity: { id: '9' }, user: { id: '1' },
      timeSpent: 1, startDate: new Date(visible.spent_on + 'T12:00:00Z'),
      createdAt: new Date(visible.created_on), updatedAt: new Date(visible.updated_on),
    }
    const incomplete = await provider.findByCorrelation('recovery-id', input)
    expect(incomplete.isFailure()).toBe(true)
    if (incomplete.isSuccess()) return
    expect(incomplete.failure.statusCode).toBe(503)
    const absence = await provider.findByCorrelation('absent-id', input)
    expect(absence.isFailure()).toBe(true)
    corruption = undefined
    const complete = await provider.findByCorrelation('recovery-id', input)
    expect(complete.isFailure()).toBe(true)
    if (complete.isSuccess()) return
    expect(complete.failure.messageKey).toBe('DUPLICATE_TIME_ENTRY_CORRELATION')
  })
})
