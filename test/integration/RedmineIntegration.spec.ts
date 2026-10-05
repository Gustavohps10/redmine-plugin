import { MappingFieldDefinition, MetadataItem } from '@mr-tick/sdk'
import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import {
  getProvidersForVersion,
  RedmineAuthenticationStrategy,
  RedmineMemberProvider,
  RedmineMetadataProvider,
  RedmineTaskProvider,
  RedmineTimeEntryProvider,
} from '../../src/datasource'
import { RedmineTimeEntryAPI } from '../../src/types/redmine'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

const instances = process.env.REDMINE_TEST_URL
  ? [{ name: 'Custom Instance', url: process.env.REDMINE_TEST_URL }]
  : [
      { name: 'Redmine 3.4 (Porta 3030)', url: 'http://localhost:3030' },
      { name: 'Redmine 5.1 (Porta 3051)', url: 'http://localhost:3051' },
      { name: 'Redmine 6.0 (Porta 3060)', url: 'http://localhost:3060' },
    ]

describe.each(instances)('Redmine Docker Integration Matrix: $name', ({ url: API_URL }) => {
  const API_KEY = 'testapikeyredmine1234567890abcdef'
  const ATOM_KEY = 'testatomkeyredmine1234567890abcdef'

  it('deve autenticar com sucesso usando a API Key fixa no container Redmine', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const authStrategy = new RedmineAuthenticationStrategy(client)
    const result = await authStrategy.authenticate({
      credentials: {
        apiKey: API_KEY,
        atomKey: ATOM_KEY,
      },
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.member.login).toBe('admin')
      expect(result.success.member.id).toBe(1)
      expect(result.success.credentials.apiKey).toBe(API_KEY)
      expect(result.success.credentials.atomKey).toBe(ATOM_KEY)
    }
  })

  it('deve falhar a autenticacao quando a API Key for invalida', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: 'chave_invalida_123',
    })

    const authStrategy = new RedmineAuthenticationStrategy(client)
    const result = await authStrategy.authenticate({
      credentials: {
        apiKey: 'chave_invalida_123',
      },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(401)
    }
  })

  it('deve rejeitar autenticacao quando a Atom Key for abobrinha ou invalida', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
      atomKey: 'abobrinha',
    })

    const authStrategy = new RedmineAuthenticationStrategy(client)
    const result = await authStrategy.authenticate({
      credentials: {
        apiKey: API_KEY,
        atomKey: 'abobrinha',
      },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.messageKey).toBe(
        'Chave de acesso ao feed Atom inválida.',
      )
    }
  })

  it('deve rejeitar autenticacao no Redmine real mesmo quando a Atom Key tiver formato longo porem inexistente', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
      atomKey: 'chaveatomfalsa12345678901234567890abcdef',
    })

    const authStrategy = new RedmineAuthenticationStrategy(client)
    const result = await authStrategy.authenticate({
      credentials: {
        apiKey: API_KEY,
        atomKey: 'chaveatomfalsa12345678901234567890abcdef',
      },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.messageKey).toBe(
        'Chave de acesso ao feed Atom inválida.',
      )
    }
  })

  it('deve rejeitar autenticacao quando a Atom Key for deixada em branco', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const authStrategy = new RedmineAuthenticationStrategy(client)
    const result = await authStrategy.authenticate({
      credentials: {
        apiKey: API_KEY,
        atomKey: '',
      },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.messageKey).toBe(
        'Chave de acesso ao feed Atom obrigatória.',
      )
    }
  })

  it('deve consultar informacoes do membro atual via RedmineMemberProvider', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const memberProvider = new RedmineMemberProvider(client)
    const result = await memberProvider.getCurrentUser()

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const member = result.success
      expect(member).not.toBeNull()
      expect(member?.login).toBe('admin')
      expect(member?.firstname).toBe('Redmine')
      expect(member?.lastname).toBe('Admin')
    }
  })

  it('deve listar metadados reais (atividades, status, trackers, prioridades)', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const metadataProvider = new RedmineMetadataProvider(client)
    const checkpoint = { updatedAt: new Date(0), id: '' }
    const result = await metadataProvider.getMetadata('1', checkpoint, 50)

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const metadata = result.success

      const activities = metadata.activities
      expect(activities.length).toBeGreaterThan(0)
      const devActivity = activities.find(
        (a: MetadataItem) => a.name === 'Desenvolvimento',
      )
      expect(devActivity).toBeDefined()

      const statuses = metadata.taskStatuses
      expect(statuses.length).toBeGreaterThan(0)

      const trackers = metadata.trackStatuses
      expect(trackers.length).toBeGreaterThan(0)

      const priorities = metadata.taskPriorities
      expect(priorities.length).toBeGreaterThan(0)
    }
  })

  it('deve sincronizar tarefas via Atom Feed usando a Atom Key real e enriquecer com REST API', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
      atomKey: ATOM_KEY,
    })

    const taskProvider = new RedmineTaskProvider(client)
    const checkpoint = { updatedAt: new Date(0), id: '' }
    const result = await taskProvider.pull('1', checkpoint, 50)

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const tasks = result.success
      expect(tasks.length).toBeGreaterThan(0)

      const firstTask = tasks[0]
      expect(firstTask).toBeDefined()
      expect(firstTask.id).toBeDefined()
      expect(firstTask.title.length).toBeGreaterThan(0)
      expect(firstTask.projectName).toBeDefined()
      expect(firstTask.status?.name).toBeDefined()
      expect(firstTask.status?.id).not.toBe('0')
      expect(firstTask.description).toBeDefined()
    }
  })

  it('deve executar o ciclo completo de apontamento de horas (CRUD) no Redmine real', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const metadataProvider = new RedmineMetadataProvider(client)
    const checkpoint = { updatedAt: new Date(0), id: '' }
    const metaRes = await metadataProvider.getMetadata('1', checkpoint, 50)
    expect(metaRes.isSuccess()).toBe(true)
    if (metaRes.isFailure()) return

    const devActivity = metaRes.success.activities.find(
      (a: MetadataItem) => a.name === 'Desenvolvimento',
    )
    expect(devActivity).toBeDefined()
    if (!devActivity) return

    const timeEntryProvider = new RedmineTimeEntryProvider(client)

    // 1. Create (Lançar horas)
    const createResult = await timeEntryProvider.create({
      task: { id: '1' },
      activity: { id: devActivity.id },
      user: { id: '1' },
      timeSpent: 1.5,
      comments: 'Lancamento de horas para teste de integracao',
      startDate: new Date('2026-09-26T10:00:00Z'),
      createdAt: new Date('2026-09-26T10:00:00Z'),
      updatedAt: new Date('2026-09-26T10:00:00Z'),
    })

    expect(createResult.isSuccess()).toBe(true)
    if (createResult.isFailure()) return

    const createdId = createResult.success.id
    expect(createdId).toBeDefined()

    // 2. Read (Verificar que o apontamento foi salvo)
    const getResult = await client.getTimeEntryById(createdId)
    expect(getResult.isSuccess()).toBe(true)
    if (getResult.isSuccess()) {
      const entry = getResult.success.time_entry
      expect(entry).toBeDefined()
      expect(entry.hours).toBe(1.5)
      expect(entry.comments).toBe(
        'Lancamento de horas para teste de integracao',
      )
    }

    // 3. Update (Editar o lançamento)
    const updateResult = await timeEntryProvider.update({
      id: createdId,
      task: { id: '1' },
      activity: { id: devActivity.id },
      user: { id: '1' },
      timeSpent: 2.5,
      comments: 'Horas atualizadas com sucesso no teste',
      startDate: new Date('2026-09-26T10:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(updateResult.isSuccess()).toBe(true)

    // Conferir valor atualizado no Redmine
    const getUpdatedRes = await client.getTimeEntryById(createdId)
    expect(getUpdatedRes.isSuccess()).toBe(true)
    if (getUpdatedRes.isSuccess()) {
      expect(getUpdatedRes.success.time_entry.hours).toBe(2.5)
      expect(getUpdatedRes.success.time_entry.comments).toBe(
        'Horas atualizadas com sucesso no teste',
      )
    }

    // 4. Delete (Excluir o lançamento)
    const deleteResult = await timeEntryProvider.delete(createdId)
    expect(deleteResult.isSuccess()).toBe(true)

    // 5. Verificar que foi realmente excluído (404)
    const getDeletedRes = await client.getTimeEntryById(createdId)
    expect(getDeletedRes.isFailure()).toBe(true)
    if (getDeletedRes.isFailure()) {
      expect(getDeletedRes.failure.statusCode).toBe(404)
    }
  })

  it('deve apontar no horario noturno (22h30 UTC-3) preservando a data civil correta e comments null no Redmine real', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const metadataProvider = new RedmineMetadataProvider(client)
    const checkpoint = { updatedAt: new Date(0), id: '' }
    const metaRes = await metadataProvider.getMetadata('1', checkpoint, 50)
    expect(metaRes.isSuccess()).toBe(true)
    if (metaRes.isFailure()) return

    const devActivity = metaRes.success.activities.find(
      (a: MetadataItem) => a.name === 'Desenvolvimento',
    )
    expect(devActivity).toBeDefined()
    if (!devActivity) return

    const timeEntryProvider = new RedmineTimeEntryProvider(client)

    // Data noturna às 22h30 do dia 30/09 no fuso local do ambiente
    const nightStartDate = new Date(2026, 8, 30, 22, 30, 0)

    const createResult = await timeEntryProvider.create({
      task: { id: '46' },
      activity: { id: devActivity.id },
      user: { id: '1' },
      timeSpent: 1.0,
      startDate: nightStartDate,
      comments: undefined,
      createdAt: nightStartDate,
      updatedAt: nightStartDate,
    })

    expect(createResult.isSuccess()).toBe(true)
    if (createResult.isFailure()) return

    const createdId = createResult.success.id

    // Validar direto na API do Redmine que spent_on foi gravado como 2026-09-30 (e não 2026-10-01)
    const directApiRes = await client.getTimeEntryById(createdId)
    expect(directApiRes.isSuccess()).toBe(true)
    if (directApiRes.isSuccess()) {
      expect(directApiRes.success.time_entry.spent_on).toBe('2026-09-30')
      expect(directApiRes.success.time_entry.hours).toBe(1.0)
    }

    // Validar via findById com enriquecimento do provider
    const getByIdRes = await timeEntryProvider.findById(createdId)
    expect(getByIdRes.isSuccess()).toBe(true)
    if (getByIdRes.isSuccess() && getByIdRes.success) {
      const dto = getByIdRes.success
      expect(dto.task.id).toBe('46')
      expect(dto.startDate).toBeDefined()
      if (dto.startDate) {
        expect(dto.startDate.getFullYear()).toBe(2026)
        expect(dto.startDate.getMonth()).toBe(8) // 8 = Setembro (0-indexed)
        expect(dto.startDate.getDate()).toBe(30)
      }
    }

    // Cleanup
    await timeEntryProvider.delete(createdId)
  })

  it('deve consultar tarefa detalhada com descricao completa em Textile e journals', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const issueRes = await client.getIssueById('2')
    expect(issueRes.isSuccess()).toBe(true)
    if (issueRes.isSuccess()) {
      const issue = issueRes.success.issue
      expect(issue.id).toBe(2)
      expect(issue.subject).toBe(
        'Implementar Gateway de Pagamentos e Webhooks Assíncronos',
      )
      expect(issue.project.name).toBe('Core Platform & API')
      expect(issue.author?.name).toBe('Mariana Souza')
      expect(issue.assigned_to?.name).toBe('Carlos Silva')
      expect(issue.description).toContain('h1. Especificação Técnica')
      expect(issue.description).toContain('|_. Parâmetro |_. Tipo de Dado |')
      expect(issue.description).toContain('<code class="typescript">')
    }
  })

  it('deve resolver providers corretamente para versao 3.4, versao 5.0 e versao 6.0 via getProvidersForVersion e realizar operacoes', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
      atomKey: ATOM_KEY,
    })

    const providers34 = getProvidersForVersion(client, '3.4')
    const pullResult34 = await providers34.task.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      5,
    )
    expect(pullResult34.isSuccess()).toBe(true)

    const providers50 = getProvidersForVersion(client, '5.0')
    const pullResult50 = await providers50.task.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      5,
    )
    expect(pullResult50.isSuccess()).toBe(true)

    const providers60 = getProvidersForVersion(client, '6.0')
    const pullResult60 = await providers60.task.pull(
      '1',
      { updatedAt: new Date(0), id: '0' },
      5,
    )
    expect(pullResult60.isSuccess()).toBe(true)
  }, 15000)

  it('deve obter campos de mapeamento unificados e descobrir custom fields dinamicamente no Redmine real com Admin', async () => {
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: API_KEY,
    })

    const metadataProvider = new RedmineMetadataProvider(client)
    const result = await metadataProvider.getMappingFields()

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const fields = result.success
      const statusFields = fields.filter(
        (field: MappingFieldDefinition) => field.category === 'status',
      )
      const activityFields = fields.filter(
        (field: MappingFieldDefinition) => field.category === 'activity',
      )
      const priorityFields = fields.filter(
        (field: MappingFieldDefinition) => field.category === 'priority',
      )
      const trackerFields = fields.filter(
        (field: MappingFieldDefinition) => field.category === 'tracker',
      )
      const customFields = fields.filter(
        (field: MappingFieldDefinition) => field.category === 'custom',
      )

      expect(statusFields.length).toBeGreaterThan(0)
      expect(activityFields.length).toBeGreaterThan(0)
      expect(priorityFields.length).toBeGreaterThan(0)
      expect(trackerFields.length).toBeGreaterThan(0)

      // Valida que os custom fields reais do Redmine foram descobertos
      expect(customFields.length).toBeGreaterThan(0)
      const fieldNames = customFields.map(
        (field: MappingFieldDefinition) => field.name,
      )
      expect(fieldNames).toContain('Tipo de Demanda')
    }
  })

  it('deve obter campos de mapeamento e descobrir custom fields com sucesso mesmo com usuario NAO-ADMIN (sem acesso a /custom_fields.json)', async () => {
    const NON_ADMIN_KEY = 'carlosapikeyredmine1234567890abcdef'
    const httpClient = new AxiosHttpClient()
    const client = new RedmineClient(httpClient, {
      apiUrl: API_URL,
      apiKey: NON_ADMIN_KEY,
    })

    const metadataProvider = new RedmineMetadataProvider(client)
    const result = await metadataProvider.getMappingFields()

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const fields = result.success
      const customFields = fields.filter(
        (field: MappingFieldDefinition) => field.category === 'custom',
      )

      // O usuário comum (Carlos) descobre perfeitamente os custom fields das tarefas em que atua
      expect(customFields.length).toBeGreaterThan(0)
      const fieldNames = customFields.map(
        (field: MappingFieldDefinition) => field.name,
      )
      expect(fieldNames).toContain('Tipo de Demanda')
    }
  })
})

