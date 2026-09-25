import { DataSourceContext } from '@mr-tick/sdk'
import { describe, expect, it } from 'vitest'

import { RedmineDataSource } from '../src/RedmineDataSource.js'
import userFixture from './fixtures/user.json'
import { MockHttpClient } from './helpers/MockHttpClient.js'

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

    const context: DataSourceContext = {
      httpClient,
      config: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'key-123', atomKey: 'atom-456' },
    }

    const dataSource = new RedmineDataSource()
    const instance = dataSource.createInstance(context)

    expect(instance.authStrategy).toBeDefined()
    expect(instance.tasksProvider).toBeDefined()
    expect(instance.timeEntriesProvider).toBeDefined()
    expect(instance.membersProvider).toBeDefined()
    expect(instance.metadataProvider).toBeDefined()
    expect(instance.testConnection).toBeDefined()

    if (instance.testConnection) {
      const healthResult = await instance.testConnection()
      expect(healthResult.isSuccess()).toBe(true)
      if (healthResult.isSuccess()) {
        expect(healthResult.success.ok).toBe(true)
        expect(healthResult.success.message).toContain('Redmine Admin')
      }
    }
  })

  it('deve indicar falha em testConnection quando credenciais forem inválidas', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/users/current.json', 401, {}, 'CHAVE_INVALIDA')

    const context: DataSourceContext = {
      httpClient,
      config: { apiUrl: 'https://redmine.test' },
      credentials: { apiKey: 'wrong-key' },
    }

    const dataSource = new RedmineDataSource()
    const instance = dataSource.createInstance(context)

    if (instance.testConnection) {
      const healthResult = await instance.testConnection()
      expect(healthResult.isSuccess()).toBe(true)
      if (healthResult.isSuccess()) {
        expect(healthResult.success.ok).toBe(false)
        expect(healthResult.success.message).toBe('CHAVE_INVALIDA')
      }
    }
  })
})
