import { describe, expect, it } from 'vitest'

import { RedmineAuthenticationStrategy } from '../src/RedmineAuthenticationStrategy.js'
import { RedmineClient } from '../src/RedmineClient.js'
import userFixture from './fixtures/user.json'
import { MockHttpClient } from './helpers/MockHttpClient.js'

describe('RedmineAuthenticationStrategy', () => {
  it('deve autenticar com sucesso e mapear MemberDTO com as credenciais', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 200, userFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'valid-api-key',
    })

    const strategy = new RedmineAuthenticationStrategy(client)

    const result = await strategy.authenticate({
      configuration: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'valid-api-key', atomKey: 'valid-atom-key' },
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const { member, credentials } = result.success
      expect(member.id).toBe(1)
      expect(member.login).toBe('admin')
      expect(member.firstname).toBe('Redmine')
      expect(member.lastname).toBe('Admin')
      expect(member.admin).toBe(true)
      expect(member.customFields.length).toBe(1)
      expect(member.customFields[0].name).toBe('Cargo')
      expect(credentials.apiKey).toBe('valid-api-key')
      expect(credentials.atomKey).toBe('valid-atom-key')
    }
  })

  it('deve repassar erro 401 Unauthorized quando chave for inválida', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 401, {}, 'CHAVE_INVALIDA')

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'wrong-key',
    })

    const strategy = new RedmineAuthenticationStrategy(client)

    const result = await strategy.authenticate({
      configuration: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'wrong-key' },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(401)
      expect(result.failure.messageKey).toBe('CHAVE_INVALIDA')
    }
  })
})
