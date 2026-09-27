import { DataSourceContext } from '@mr-tick/sdk'
import { describe, expect, it } from 'vitest'

import { RedmineDataSource } from '../src/datasource'
import userFixture from './fixtures/user.json'
import { MockHttpClient } from './helpers/MockHttpClient'

describe('RedmineDataSource', () => {
  it('deve retornar o esquema de conexão com abas de credenciais e configuração', () => {
    const dataSource = new RedmineDataSource()
    const schema = dataSource.getConnectionSchema()

    expect(schema).toBeDefined()
    expect(schema.length).toBe(2)
  })

  it('deve criar uma instância funcional com todos os providers', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 200, userFixture)
    httpClient.setRoute(
      'GET',
      'activity.atom',
      200,
      '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Activity</title></feed>',
    )

    const validAtomKey = 'testatomkeyredmine1234567890abcdef'
    const context: DataSourceContext = {
      httpClient,
      config: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'key-123', atomKey: validAtomKey },
    }

    const dataSource = new RedmineDataSource()
    const instance = dataSource.createInstance(context)

    expect(instance.authStrategy).toBeDefined()
    expect(instance.tasksProvider).toBeDefined()
    expect(instance.timeEntriesProvider).toBeDefined()
    expect(instance.membersProvider).toBeDefined()
    expect(instance.metadataProvider).toBeDefined()

    const authResult = await instance.authStrategy.authenticate({
      credentials: { apiKey: 'key-123', atomKey: validAtomKey },
    })
    expect(authResult.isSuccess()).toBe(true)
    if (authResult.isSuccess()) {
      expect(authResult.success.member.firstname).toContain('Redmine')
    }
  })

  it('deve indicar falha na autenticacao quando credenciais forem inválidas', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 401, {}, 'CHAVE_INVALIDA')

    const context: DataSourceContext = {
      httpClient,
      config: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'wrong-key' },
    }

    const dataSource = new RedmineDataSource()
    const instance = dataSource.createInstance(context)

    const authResult = await instance.authStrategy.authenticate({
      credentials: { apiKey: 'wrong-key' },
    })
    expect(authResult.isFailure()).toBe(true)
  })

  it('deve instanciar providers corretamente quando versão 3.4 for explicitamente selecionada', () => {
    const httpClient = new MockHttpClient()
    const context: DataSourceContext = {
      httpClient,
      config: { apiUrl: 'https://redmine.test', redmineVersion: '3.4' },
      credentials: { apiKey: 'key-123' },
    }

    const dataSource = new RedmineDataSource()
    const instance = dataSource.createInstance(context)

    expect(instance.tasksProvider).toBeDefined()
    expect(instance.timeEntriesProvider).toBeDefined()
    expect(instance.membersProvider).toBeDefined()
    expect(instance.metadataProvider).toBeDefined()
  })

  it('deve instanciar providers corretamente quando versão 5.0 for explicitamente selecionada', () => {
    const httpClient = new MockHttpClient()
    const context: DataSourceContext = {
      httpClient,
      config: { apiUrl: 'https://redmine.test', redmineVersion: '5.0' },
      credentials: { apiKey: 'key-123' },
    }

    const dataSource = new RedmineDataSource()
    const instance = dataSource.createInstance(context)

    expect(instance.tasksProvider).toBeDefined()
    expect(instance.timeEntriesProvider).toBeDefined()
    expect(instance.membersProvider).toBeDefined()
    expect(instance.metadataProvider).toBeDefined()
  })

  it('deve instanciar providers corretamente quando versão 6.0 for explicitamente selecionada', () => {
    const httpClient = new MockHttpClient()
    const context: DataSourceContext = {
      httpClient,
      config: { apiUrl: 'https://redmine.test', redmineVersion: '6.0' },
      credentials: { apiKey: 'key-123' },
    }

    const dataSource = new RedmineDataSource()
    const instance = dataSource.createInstance(context)

    expect(instance.tasksProvider).toBeDefined()
    expect(instance.timeEntriesProvider).toBeDefined()
    expect(instance.membersProvider).toBeDefined()
    expect(instance.metadataProvider).toBeDefined()
  })
})

