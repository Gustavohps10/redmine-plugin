import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/client/RedmineClient'
import { RedmineTaskProvider } from '../src/datasource'
import issuesFixture from './fixtures/issues.json'
import { MockHttpClient } from './helpers/MockHttpClient'

describe('RedmineTaskProvider', () => {
  it('deve realizar pull de tarefas mapeando para TaskDTO', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/issues.json', 200, issuesFixture)

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
      expect(result.success.length).toBe(2)
      const firstTask = result.success[0]
      expect(firstTask.id).toBe('101')
      expect(firstTask.title).toBe('Corrigir falha no checkout de pagamentos')
      expect(firstTask.description).toBe('Ao tentar finalizar a compra com PIX, ocorre timeout.')
      expect(firstTask.projectName).toBe('Projeto Alpha')
      expect(firstTask.status.name).toBe('Nova')
      expect(firstTask.status.id).toBe('1')
      expect(firstTask.priority?.name).toBe('Normal')
      expect(firstTask.author?.name).toBe('Redmine Admin')
      expect(firstTask.assignedTo?.name).toBe('Redmine Admin')
      expect(firstTask.tracker?.id).toBe('1')
      expect(firstTask.url).toBe('https://redmine.test/issues/101')
    }
  })

  it('deve filtrar tarefas anteriores ao checkpoint durante o pull', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/issues.json', 200, issuesFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTaskProvider(client)

    // Checkpoint com a data e ID do primeiro registro (issue 101, atualizada em 2026-09-25T11:00:00Z)
    const checkpointDate = new Date('2026-09-25T11:00:00Z')
    const result = await provider.pull('1', { updatedAt: checkpointDate, id: '101' }, 10)

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      // Somente a issue 102 (atualizada em 2026-09-25T11:30:00Z) deve ser retornada
      expect(result.success.length).toBe(1)
      expect(result.success[0].id).toBe('102')
      expect(result.success[0].title).toBe('Implementar dashboard com métricas diárias')
    }
  })

  it('deve buscar tarefa por ID via findById', async () => {
    const httpClient = new MockHttpClient()
    const singleIssueFixture = {
      issue: issuesFixture.issues[0],
    }
    httpClient.setRoute('GET', '/issues/101.json', 200, singleIssueFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTaskProvider(client)

    const result = await provider.findById('101')
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).not.toBeNull()
      expect(result.success?.id).toBe('101')
      expect(result.success?.title).toBe('Corrigir falha no checkout de pagamentos')
    }
  })

  it('deve retornar null no findById quando tarefa não existir (404)', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/issues/9999.json', 404, {}, 'NOT_FOUND')

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTaskProvider(client)

    const result = await provider.findById('9999')
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).toBeNull()
    }
  })

  it('deve listar tarefas paginadas via findAll', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute('GET', '/issues.json', 200, issuesFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineTaskProvider(client)

    const result = await provider.findAll({ page: 1, pageSize: 10 })
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.items.length).toBe(2)
      expect(result.success.total).toBe(2)
      expect(result.success.page).toBe(1)
    }
  })

  it('deve realizar pull de tarefas via feed Atom quando atomKey estiver configurada', async () => {
    const httpClient = new MockHttpClient()
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Redmine: Atividades</title>
  <updated>2026-09-25T11:45:00Z</updated>
  <entry>
    <title>Projeto Alpha - Defeito #201 (Em Andamento): Corrigir memory leak no worker</title>
    <id>https://redmine.test/issues/201</id>
    <updated>2026-09-25T11:45:00Z</updated>
    <author>
      <name>Redmine Admin</name>
    </author>
    <content type="html">Foi identificado consumo excessivo de RAM no worker.</content>
  </entry>
</feed>`

    httpClient.setRoute('GET', '/users/1.json', 200, {
      user: {
        id: 1,
        login: 'admin',
        firstname: 'Redmine',
        lastname: 'Admin',
        mail: 'admin@example.com',
        created_on: '2026-01-01T00:00:00Z',
      },
    })
    httpClient.setRoute('GET', 'activity.atom', 200, atomXml)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
      atomKey: 'atom-key-xyz',
    })

    const provider = new RedmineTaskProvider(client)

    const result = await provider.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      10,
    )

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.length).toBe(1)
      expect(result.success[0].id).toBe('201')
      expect(result.success[0].title).toBe('Corrigir memory leak no worker')
      expect(result.success[0].projectName).toBe('Projeto Alpha')
      expect(result.success[0].status.name).toBe('Em Andamento')
      expect(result.success[0].author?.name).toBe('Redmine Admin')
    }
  })

  it('deve enriquecer tarefas do feed Atom com detalhes completos da REST API', async () => {
    const httpClient = new MockHttpClient()
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Redmine: Atividades</title>
  <updated>2026-09-25T11:45:00Z</updated>
  <entry>
    <title>Projeto Alpha - Defeito #201 (Em Andamento): Corrigir memory leak no worker</title>
    <id>https://redmine.test/issues/201</id>
    <updated>2026-09-25T11:45:00Z</updated>
    <author>
      <name>Redmine Admin</name>
    </author>
  </entry>
</feed>`

    httpClient.setRoute('GET', '/users/1.json', 200, {
      user: { id: 1, login: 'admin', firstname: 'Redmine', lastname: 'Admin' },
    })
    httpClient.setRoute('GET', 'activity.atom', 200, atomXml)
    httpClient.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 201,
          subject: 'Corrigir memory leak no worker',
          description: 'Descricao rica completa recuperada da API REST.',
          project: { id: 1, name: 'Projeto Alpha' },
          tracker: { id: 1, name: 'Bug' },
          status: { id: 2, name: 'Em Andamento' },
          priority: { id: 4, name: 'Urgente' },
          author: { id: 1, name: 'Redmine Admin' },
          assigned_to: { id: 1, name: 'Redmine Admin' },
          start_date: '2026-09-25',
          due_date: '2026-09-30',
          done_ratio: 50,
          spent_hours: 4.5,
          created_on: '2026-09-25T10:00:00Z',
          updated_on: '2026-09-25T11:45:00Z',
        },
      ],
      total_count: 1,
    })

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
      atomKey: 'testatomkeyredmine1234567890abcdef',
    })

    const provider = new RedmineTaskProvider(client)

    const result = await provider.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      10,
    )

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.length).toBe(1)
      const task = result.success[0]
      expect(task.id).toBe('201')
      expect(task.title).toBe('Corrigir memory leak no worker')
      expect(task.description).toBe(
        'Descricao rica completa recuperada da API REST.',
      )
      expect(task.status.id).toBe('2')
      expect(task.status.name).toBe('Em Andamento')
      expect(task.priority?.id).toBe('4')
      expect(task.priority?.name).toBe('Urgente')
      expect(task.doneRatio).toBe(50)
      expect(task.spentHours).toBe(4.5)
    }
  })
})
