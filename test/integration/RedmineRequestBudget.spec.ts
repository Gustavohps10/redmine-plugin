import { TimeEntryDTO, TimeEntryPullCheckpointDTO } from '@mr-tick/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import {
  RedmineMetadataProvider,
  RedmineTaskProvider,
  RedmineTimeEntryProvider,
} from '../../src/datasource'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

const instances = process.env.REDMINE_TEST_URL
  ? [{ name: 'Custom Instance', url: process.env.REDMINE_TEST_URL }]
  : [
      { name: 'Redmine 3.4 (Porta 3030)', url: 'http://localhost:3030' },
      { name: 'Redmine 5.1 (Porta 3051)', url: 'http://localhost:3051' },
      { name: 'Redmine 6.0 (Porta 3060)', url: 'http://localhost:3060' },
    ]

const API_KEY = 'testapikeyredmine1234567890abcdef'
const ATOM_KEY = 'testatomkeyredmine1234567890abcdef'
const MEMBER_ID = '1'
const EPOCH = { updatedAt: new Date(0), id: '' }

describe.each(instances)(
  'Orçamento de requests no Redmine real: $name',
  ({ url: API_URL }) => {
    let hits: Record<string, number>

    const count = (path: string): number => hits[path] ?? 0
    const createClient = (): RedmineClient =>
      new RedmineClient(new AxiosHttpClient(), {
        apiUrl: API_URL,
        apiKey: API_KEY,
        atomKey: ATOM_KEY,
      })

    beforeEach(() => {
      hits = {}
      const realFetch = globalThis.fetch
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const raw = input instanceof Request ? input.url : String(input)
        const path = new URL(raw).pathname
        hits[path] = count(path) + 1

        return realFetch(input, init)
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('metadados: 4 requests na primeira vez e nenhum nas seguintes', async () => {
      const provider = new RedmineMetadataProvider(createClient())

      const results = await Promise.all([
        provider.getMetadata(MEMBER_ID, EPOCH, 50),
        provider.getMetadata(MEMBER_ID, EPOCH, 50),
      ])
      const again = await provider.getMetadata(MEMBER_ID, EPOCH, 50)

      expect(results.every((result) => result.isSuccess())).toBe(true)
      expect(again.isSuccess()).toBe(true)
      expect(Object.values(hits).reduce((sum, value) => sum + value, 0)).toBe(4)
    })

    it('apontamentos: o scan custa uma passada pelo snapshot e entrega os mesmos registros do snapshot completo', async () => {
      const client = createClient()
      const provider = new RedmineTimeEntryProvider(client)
      const to = new Date()
      const from = new Date(to)
      from.setMonth(to.getMonth() - 2)
      const reference = await new RedmineTimeEntryProvider(
        createClient(),
      ).findByMemberId(MEMBER_ID, from, to)
      expect(reference.isSuccess()).toBe(true)
      if (reference.isFailure()) return
      hits = {}

      let checkpoint: TimeEntryPullCheckpointDTO = EPOCH
      const items: TimeEntryDTO[] = []
      for (let round = 0; round < 50; round++) {
        const page = await provider.pull(MEMBER_ID, checkpoint, 5)
        expect(page.isSuccess()).toBe(true)
        if (page.isFailure()) return
        items.push(...page.success.items)
        checkpoint = page.success.checkpoint
        if (!page.success.hasMore) break
      }

      const pagesPerSnapshot = Math.max(
        1,
        Math.ceil(reference.success.items.length / 100),
      )
      expect(count('/time_entries.json')).toBeGreaterThanOrEqual(
        pagesPerSnapshot,
      )
      const received = new Set(items.map((entry) => entry.id))
      for (const expected of reference.success.items)
        expect(received.has(expected.id)).toBe(true)
    }, 15000)

    it('tarefas: sincronização repetida sem novidades não repete usuário nem enriquecimento', async () => {
      const provider = new RedmineTaskProvider(createClient())
      const checkpoint = {
        updatedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
        id: '',
      }

      const first = await provider.pull(MEMBER_ID, checkpoint, 50)
      expect(first.isSuccess()).toBe(true)
      if (first.isFailure()) return
      const afterFirst = { ...hits }

      const second = await provider.pull(
        MEMBER_ID,
        {
          updatedAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          id: '',
        },
        50,
      )

      expect(second.isSuccess()).toBe(true)
      if (second.isFailure()) return
      expect(second.success).toEqual([])
      expect(count('/users/1.json')).toBe(1)
      expect(count('/activity.atom')).toBe(
        (afterFirst['/activity.atom'] ?? 0) + 1,
      )
      expect(count('/issues.json') - (afterFirst['/issues.json'] ?? 0)).toBe(1)
    })

    it('tarefas: duas janelas simultâneas compartilham as chamadas', async () => {
      const provider = new RedmineTaskProvider(createClient())
      const checkpoint = {
        updatedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
        id: '',
      }

      const [first, second] = await Promise.all([
        provider.pull(MEMBER_ID, checkpoint, 50),
        provider.pull(MEMBER_ID, checkpoint, 50),
      ])

      expect(first.isSuccess() && second.isSuccess()).toBe(true)
      if (first.isFailure() || second.isFailure()) return
      expect(second.success.map((task) => task.id)).toEqual(
        first.success.map((task) => task.id),
      )
      expect(count('/users/1.json')).toBe(1)
      expect(count('/activity.atom')).toBe(1)
    })
  },
)
