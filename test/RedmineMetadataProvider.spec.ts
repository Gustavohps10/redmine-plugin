import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/client/RedmineClient'
import { RedmineMetadataProvider } from '../src/datasource'
import prioritiesFixture from './fixtures/issue_priorities.json'
import statusesFixture from './fixtures/issue_statuses.json'
import activitiesFixture from './fixtures/time_entry_activities.json'
import trackersFixture from './fixtures/trackers.json'
import { MockHttpClient } from './helpers/MockHttpClient'

describe('RedmineMetadataProvider', () => {
  it('deve obter e mapear metadados completos do Redmine', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute(
      'GET',
      '/enumerations/time_entry_activities.json',
      200,
      activitiesFixture,
    )
    httpClient.setRoute('GET', '/issue_statuses.json', 200, statusesFixture)
    httpClient.setRoute(
      'GET',
      '/enumerations/issue_priorities.json',
      200,
      prioritiesFixture,
    )
    httpClient.setRoute('GET', '/trackers.json', 200, trackersFixture)

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineMetadataProvider(client)

    const result = await provider.getMetadata(
      '1',
      { updatedAt: new Date(0), id: '0' },
      50,
    )

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const metadata = result.success
      expect(metadata.activities.length).toBe(3)
      expect(metadata.activities[0].name).toBe('Design')
      expect(metadata.activities[0].icon).toBe('Palette')
      expect(metadata.activities[1].name).toBe('Desenvolvimento')
      expect(metadata.activities[1].icon).toBe('Code')

      expect(metadata.taskStatuses.length).toBe(4)
      expect(metadata.taskStatuses[0].name).toBe('Nova')
      expect(metadata.taskStatuses[0].icon).toBe('CircleDot')

      expect(metadata.taskPriorities.length).toBe(4)
      expect(metadata.trackStatuses.length).toBe(3)
      expect(metadata.participantRoles.length).toBe(3)
      expect(metadata.estimationTypes.length).toBe(3)
    }
  })

  it('deve obter campos de mapeamento unificados e descobrir custom fields a partir de issues', async () => {
    const httpClient = new MockHttpClient()
    httpClient.setRoute(
      'GET',
      '/enumerations/time_entry_activities.json',
      200,
      activitiesFixture,
    )
    httpClient.setRoute('GET', '/issue_statuses.json', 200, statusesFixture)
    httpClient.setRoute(
      'GET',
      '/enumerations/issue_priorities.json',
      200,
      prioritiesFixture,
    )
    httpClient.setRoute('GET', '/trackers.json', 200, trackersFixture)
    httpClient.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 101,
          subject: 'Issue com custom field',
          custom_fields: [
            { id: 1, name: 'Tipo de Demanda', value: 'Feature' },
            { id: 2, name: 'Squad Responsável', value: 'Core' },
          ],
        },
        {
          id: 102,
          subject: 'Segunda issue com campo repetido',
          custom_fields: [
            { id: 1, name: 'Tipo de Demanda', value: 'Bug' },
          ],
        },
      ],
      total_count: 2,
    })

    const client = new RedmineClient(httpClient, {
      apiUrl: 'https://redmine.test',
      apiKey: 'test-key',
    })

    const provider = new RedmineMetadataProvider(client)
    const result = await provider.getMappingFields()

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      const fields = result.success
      const statusFields = fields.filter((f) => f.category === 'status')
      const activityFields = fields.filter((f) => f.category === 'activity')
      const priorityFields = fields.filter((f) => f.category === 'priority')
      const trackerFields = fields.filter((f) => f.category === 'tracker')
      const customFields = fields.filter((f) => f.category === 'custom')

      expect(statusFields.length).toBe(4)
      expect(activityFields.length).toBe(3)
      expect(priorityFields.length).toBe(4)
      expect(trackerFields.length).toBe(3)

      // Deve ter descoberto os 2 custom fields únicos (id 1 e 2), sem duplicatas
      expect(customFields.length).toBe(2)
      expect(customFields[0].id).toBe('custom_field_1')
      expect(customFields[0].name).toBe('Tipo de Demanda')
      expect(customFields[1].id).toBe('custom_field_2')
      expect(customFields[1].name).toBe('Squad Responsável')
    }
  })
})
