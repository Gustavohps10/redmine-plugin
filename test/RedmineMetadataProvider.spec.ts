import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../src/RedmineClient.js'
import { RedmineMetadataProvider } from '../src/RedmineMetadataProvider.js'
import prioritiesFixture from './fixtures/issue_priorities.json'
import statusesFixture from './fixtures/issue_statuses.json'
import activitiesFixture from './fixtures/time_entry_activities.json'
import trackersFixture from './fixtures/trackers.json'
import { MockHttpClient } from './helpers/MockHttpClient.js'

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
})
