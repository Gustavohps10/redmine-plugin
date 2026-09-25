import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/RedmineClient.js'
import issuesFixture from './fixtures/issues.json'
import timeEntriesFixture from './fixtures/time_entries.json'
import userFixture from './fixtures/user.json'
import { MockHttpClient } from './helpers/MockHttpClient.js'

describe('RedmineClient', () => {
  it('deve falhar com ValidationError se apiUrl não for informada', async () => {
    const httpClient = new MockHttpClient()
    const client = new RedmineClient(httpClient, { apiUrl: '', apiKey: 'token-123' })

    const result = await client.getCurrentUser()

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(422)
    }
  })

  it('deve falhar com ValidationError se apiKey não for informada', async () => {
    const httpClient = new MockHttpClient()
    const client = new RedmineClient(httpClient, { apiUrl: 'https://redmine.test', apiKey: '' })

    const result = await client.getCurrentUser()

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(422)
    }
  })

  it('deve configurar o httpClient com baseURL e header X-Redmine-API-Key', () => {
    const httpClient = new MockHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test/api/',
      apiKey: 'secret-key-xyz',
    })

    expect(client.getApiUrl()).toBe('https://redmine.test/api')
    expect(httpClient.configuredConfig?.baseURL).toBe('https://redmine.test/api')
    expect(httpClient.configuredConfig?.headers?.['X-Redmine-API-Key']).toBe('secret-key-xyz')
  })

  it('deve buscar usuário atual via getCurrentUser', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 200, userFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'secret-key-xyz',
    })

    const result = await client.getCurrentUser()
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.user.id).toBe(1)
      expect(result.success.user.login).toBe('admin')
    }
  })

  it('deve repassar falha 401 Unauthorized do httpClient', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 401, {}, 'INVALID_TOKEN')

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'wrong-key',
    })

    const result = await client.getCurrentUser()
    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(401)
      expect(result.failure.messageKey).toBe('INVALID_TOKEN')
    }
  })

  it('deve listar tarefas via listIssues', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/issues.json', 200, issuesFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'key-123',
    })

    const result = await client.listIssues({ status_id: '*' })
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.issues.length).toBe(2)
      expect(result.success.issues[0].subject).toBe('Corrigir falha no checkout de pagamentos')
    }
  })

  it('deve criar apontamento de horas via createTimeEntry', async () => {
    const httpClient = new MockHttpClient()
    const createdResponse = {
      time_entry: {
        id: 999,
        project: { id: 1, name: 'Projeto Alpha' },
        user: { id: 1, name: 'Admin' },
        activity: { id: 9, name: 'Desenvolvimento' },
        hours: 2,
        spent_on: '2026-09-25',
        created_on: '2026-09-25T14:00:00Z',
        updated_on: '2026-09-25T14:00:00Z',
      },
    }
    httpClient.setRoute('POST', '/time_entries.json', 201, createdResponse)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'key-123',
    })

    const result = await client.createTimeEntry({
      time_entry: {
        issue_id: 101,
        activity_id: 9,
        hours: 2,
        spent_on: '2026-09-25',
      },
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.time_entry.id).toBe(999)
    }
  })
})
