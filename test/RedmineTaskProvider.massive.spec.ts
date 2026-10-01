import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/client/RedmineClient'
import { RedmineTaskProvider } from '../src/datasource'
import massiveFixture from './fixtures/massive_issues_and_entries.json'
import { MockHttpClient } from './helpers/MockHttpClient'

describe('RedmineTaskProvider - Massive & Resilience Suite', () => {
  it('deve realizar pull inicial completo capturando tarefas atribuídas e tarefas de apoio com apontamentos nos últimos 30 dias', async () => {
    const httpClient = new MockHttpClient()

    // 1. Issues atribuídas diretamente ao usuário 1 (101 e 102)
    httpClient.setRoute(
      'GET',
      '/issues.json',
      200,
      {
        issues: massiveFixture.issues.filter(
          (issue) => issue.assigned_to?.id === 1,
        ),
        total_count: 2,
      },
      undefined,
      {
        assigned_to_id: '1',
        limit: '50',
        sort: 'updated_on:asc,id:asc',
        status_id: '*',
      },
    )

    // 2. Apontamentos do usuário nos últimos 30 dias (inclui issues 101, 201, 202, 203, 204)
    httpClient.setRoute('GET', '/time_entries.json', 200, {
      time_entries: massiveFixture.time_entries.filter((entry) => entry.id !== 606),
      total_count: 5,
    })

    // 3. Enriquecimento em lote das tarefas capturadas pelos apontamentos
    const supportIssues = massiveFixture.issues.filter((issue) =>
      [201, 202, 203, 204].includes(issue.id),
    )
    httpClient.setRoute('GET', '/issues.json', 200, {
      issues: supportIssues,
      total_count: supportIssues.length,
    })

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTaskProvider(client)

    const result = await provider.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      50,
    )

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const tasks = result.success
      const taskIds = tasks.map((t) => t.id)

      // Garante que capturou tanto as tarefas atribuídas quanto as tarefas de apoio/revisão
      expect(taskIds).toContain('101')
      expect(taskIds).toContain('102')
      expect(taskIds).toContain('201')
      expect(taskIds).toContain('202')
      expect(taskIds).toContain('203')
      expect(taskIds).toContain('204')

      // Valida detalhes ricos da tarefa de apoio 201 (pertencente a Maria Silva)
      const task201 = tasks.find((t) => t.id === '201')
      expect(task201).toBeDefined()
      expect(task201?.title).toBe('Apoio técnico na integração de gateway')
      expect(task201?.tracker?.id).toBe('4')
      expect(task201?.tracker?.name).toBe('Apoio')
      expect(task201?.projectName).toBe('Projeto Alpha')
      expect(task201?.status.name).toBe('Em Andamento')

      // Valida detalhes da tarefa de revisão 202 (pertencente a Carlos Souza)
      const task202 = tasks.find((t) => t.id === '202')
      expect(task202).toBeDefined()
      expect(task202?.title).toBe('Revisão e homologação de PR de segurança')
      expect(task202?.tracker?.id).toBe('3')
      expect(task202?.tracker?.name).toBe('Suporte')
      expect(task202?.status.name).toBe('Resolvida')

      // Valida tarefa sem responsável definido 203
      const task203 = tasks.find((t) => t.id === '203')
      expect(task203).toBeDefined()
      expect(task203?.title).toBe('Alinhamento arquitetural do core monorepo')
      expect(task203?.tracker?.id).toBe('5')
      expect(task203?.tracker?.name).toBe('Reunião')

      // Valida tarefa com caracteres especiais e formatação complexa 204
      const task204 = tasks.find((t) => t.id === '204')
      expect(task204).toBeDefined()
      expect(task204?.title).toBe(
        'Bug crítico com caracteres especiais [RFC#9982] & símbolos <teste>',
      )
      expect(task204?.priority?.name).toBe('Imediata')
    }
  })

  it('deve blindar o pull incremental contra loops infinitos: não busca time_entries e retorna vazio quando não há novidades', async () => {
    const httpClient = new MockHttpClient()

    // Mock apenas da chamada de issues com filtro de data
    httpClient.setRoute('GET', '/issues.json', 200, {
      issues: [],
      total_count: 0,
    })

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTaskProvider(client)

    // Pull incremental com checkpoint recente
    const result = await provider.pull(
      '1',
      { updatedAt: new Date('2026-09-29T17:00:00Z'), id: '204' },
      50,
    )

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.length).toBe(0)
    }

    // Contagem estrita de requests: EXATAMENTE 1 chamada HTTP, NENHUMA chamada a time_entries.json
    const history = httpClient.getRequestHistory()
    expect(history.length).toBe(1)
    expect(history[0].url).toContain('issues.json')
    expect(history[0].url).not.toContain('time_entries.json')
  })

  it('deve ser resiliente caso a listagem de time_entries falhe com erro de rede ou 500 no pull inicial', async () => {
    const httpClient = new MockHttpClient()

    // Issues atribuídas com sucesso
    httpClient.setRoute('GET', '/issues.json', 200, {
      issues: [massiveFixture.issues[0]],
      total_count: 1,
    })

    // time_entries falha com 500
    httpClient.setRoute('GET', '/time_entries.json', 500, {}, 'INTERNAL_SERVER_ERROR')

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTaskProvider(client)

    // Não deve quebrar o pull geral: entrega as tarefas atribuídas normalmente
    const result = await provider.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      50,
    )

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.length).toBe(1)
      expect(result.success[0].id).toBe('101')
    }
  })
})
