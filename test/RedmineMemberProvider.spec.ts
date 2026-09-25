import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/RedmineClient.js'
import { RedmineMemberProvider } from '../src/RedmineMemberProvider.js'
import userFixture from './fixtures/user.json'
import { MockHttpClient } from './helpers/MockHttpClient.js'

describe('RedmineMemberProvider', () => {
  it('deve retornar o usuário logado via getCurrentUser', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 200, userFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineMemberProvider(client)

    const result = await provider.getCurrentUser()

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).not.toBeNull()
      expect(result.success?.id).toBe(1)
      expect(result.success?.login).toBe('admin')
      expect(result.success?.firstname).toBe('Redmine')
      expect(result.success?.lastname).toBe('Admin')
      expect(result.success?.admin).toBe(true)
      expect(result.success?.customFields.length).toBe(1)
    }
  })

  it('deve buscar usuário por ID via findById', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/1.json', 200, userFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineMemberProvider(client)

    const result = await provider.findById('1')

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).not.toBeNull()
      expect(result.success?.id).toBe(1)
    }
  })

  it('deve retornar null no findById quando usuário não for encontrado (404)', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/9999.json', 404, {}, 'NOT_FOUND')

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineMemberProvider(client)

    const result = await provider.findById('9999')

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).toBeNull()
    }
  })

  it('deve retornar ValidationError ao chamar findByCredentials', async () => {
    const httpClient = new MockHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineMemberProvider(client)

    const result = await provider.findByCredentials('user', 'pass')

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(422)
    }
  })
})
