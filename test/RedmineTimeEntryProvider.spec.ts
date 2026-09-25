import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/RedmineClient.js'
import { RedmineTimeEntryProvider } from '../src/RedmineTimeEntryProvider.js'
import timeEntriesFixture from './fixtures/time_entries.json'
import { MockHttpClient } from './helpers/MockHttpClient.js'

describe('RedmineTimeEntryProvider', () => {
  it('deve realizar pull de time entries calculando startDate e endDate com precisão UTC', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/time_entries.json', 200, timeEntriesFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTimeEntryProvider(client)

    const result = await provider.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      50,
    )

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.length).toBe(2)
      const firstEntry = result.success[0]
      expect(firstEntry.id).toBe('501')
      expect(firstEntry.task.id).toBe('101')
      expect(firstEntry.activity.id).toBe('9')
      expect(firstEntry.activity.name).toBe('Desenvolvimento')
      expect(firstEntry.user.id).toBe('1')
      expect(firstEntry.timeSpent).toBe(2.5)
      expect(firstEntry.comments).toBe('Análise da requisição e reprodução do bug')
      expect(firstEntry.startDate).toBeDefined()
      expect(firstEntry.endDate).toBeDefined()
    }
  })

  it('deve buscar time entries por intervalo de datas via findByMemberId', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/time_entries.json', 200, timeEntriesFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTimeEntryProvider(client)

    const startDate = new Date('2026-09-01')
    const endDate = new Date('2026-09-30')

    const result = await provider.findByMemberId('1', startDate, endDate)

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.items.length).toBe(2)
      expect(result.success.total).toBe(2)
      expect(result.success.page).toBe(1)
    }
  })

  it('deve buscar apontamento por ID via findById', async () => {
    const httpClient = new MockHttpClient()
    const singleEntryFixture = {
      time_entry: timeEntriesFixture.time_entries[0],
    }
    httpClient.setRoute('GET', '/time_entries/501.json', 200, singleEntryFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTimeEntryProvider(client)

    const result = await provider.findById('501')
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).not.toBeNull()
      expect(result.success?.id).toBe('501')
      expect(result.success?.timeSpent).toBe(2.5)
    }
  })

  it('deve retornar null em findById quando apontamento não for encontrado (404)', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/time_entries/9999.json', 404, {}, 'NOT_FOUND')

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTimeEntryProvider(client)

    const result = await provider.findById('9999')
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).toBeNull()
    }
  })

  it('deve criar novo apontamento via create', async () => {
    const httpClient = new MockHttpClient()
    const createdResponse = {
      time_entry: {
        id: 777,
        project: { id: 1, name: 'Projeto Alpha' },
        issue: { id: 101 },
        user: { id: 1, name: 'Redmine Admin' },
        activity: { id: 9, name: 'Desenvolvimento' },
        hours: 3.5,
        spent_on: '2026-09-25',
        created_on: '2026-09-25T15:00:00Z',
        updated_on: '2026-09-25T15:00:00Z',
      },
    }
    httpClient.setRoute('POST', '/time_entries.json', 201, createdResponse)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTimeEntryProvider(client)

    const result = await provider.create({
      task: { id: '101' },
      activity: { id: '9' },
      user: { id: '1' },
      timeSpent: 3.5,
      comments: 'Implementação de feature',
      startDate: new Date('2026-09-25T10:00:00Z'),
      createdAt: new Date('2026-09-25T10:00:00Z'),
      updatedAt: new Date('2026-09-25T10:00:00Z'),
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.id).toBe('777')
      expect(result.success.updatedAt).toBeDefined()
    }
  })

  it('deve atualizar apontamento existente via update', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('PUT', '/time_entries/501.json', 200, {})

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTimeEntryProvider(client)

    const result = await provider.update({
      id: '501',
      task: { id: '101' },
      activity: { id: '9' },
      user: { id: '1' },
      timeSpent: 4.0,
      comments: 'Tempo revisado',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.id).toBe('501')
    }
  })

  it('deve excluir apontamento via delete', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('DELETE', '/time_entries/501.json', 200, {})

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTimeEntryProvider(client)

    const result = await provider.delete('501')
    expect(result.isSuccess()).toBe(true)
  })
})
