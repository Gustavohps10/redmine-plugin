import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/client/RedmineClient'
import { RedmineAuthenticationStrategy } from '../src/datasource'
import userFixture from './fixtures/user.json'
import { MockHttpClient } from './helpers/MockHttpClient'

describe('RedmineAuthenticationStrategy', () => {
  const validAtomKey = 'testatomkeyredmine1234567890abcdef'

  it('deve autenticar com sucesso e mapear MemberDTO com as credenciais', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 200, userFixture)
    httpClient.setRoute(
      'GET',
      'activity.atom',
      200,
      '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Activity</title></feed>',
    )

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'valid-api-key',
    })

    const strategy = new RedmineAuthenticationStrategy(client)

    const result = await strategy.authenticate({
      configuration: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'valid-api-key', atomKey: validAtomKey },
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
      expect(credentials.atomKey).toBe(validAtomKey)
    }
  })

  it('deve rejeitar com erro quando a atomKey for abobrinha ou formato inválido', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 200, userFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'valid-api-key',
    })

    const strategy = new RedmineAuthenticationStrategy(client)

    const result = await strategy.authenticate({
      configuration: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'valid-api-key', atomKey: 'abobrinha' },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.messageKey).toBe(
        'Chave de acesso ao feed Atom inválida.',
      )
    }
  })

  it('deve rejeitar quando a atomKey retornar resposta que não seja um feed Atom válido', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 200, userFixture)
    httpClient.setRoute(
      'GET',
      'activity.atom',
      200,
      '<!DOCTYPE html><html><body class="controller-account action-login">Login</body></html>',
    )

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'valid-api-key',
    })

    const strategy = new RedmineAuthenticationStrategy(client)

    const result = await strategy.authenticate({
      configuration: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'valid-api-key', atomKey: validAtomKey },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.messageKey).toBe(
        'Chave de acesso ao feed Atom inválida.',
      )
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
