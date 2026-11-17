import { describe, expect, it } from 'vitest'

import { RedmineAnalyticsProvider } from '../../src/analytics/RedmineAnalyticsSource'
import { RedmineClient } from '../../src/client/RedmineClient'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

// Read-only matrix: verifies the new capability against the existing seeded servers.
describe.each([
  { version: '3.4', port: 3030 },
  { version: '5.1', port: 3051 },
  { version: '6.0', port: 3060 },
])('Analytics capability on Redmine $version', ({ port }) => {
  it('discovers schemas and reads a dataset and filter options without a datasource', async () => {
    const provider = new RedmineAnalyticsProvider(
      new RedmineClient(new AxiosHttpClient(), {
        apiUrl: `http://127.0.0.1:${port}`,
        apiKey: 'testapikeyredmine1234567890abcdef',
      }),
    )
    const listed = await provider.listAnalyticsDatasets()
    expect(listed.isSuccess()).toBe(true)
    expect(
      listed.success.some((dataset) => dataset.id === 'redmine_time_entries'),
    ).toBe(true)
    const dataset = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issue_statuses',
    })
    expect(dataset.isSuccess()).toBe(true)
    expect(dataset.success.rows.length).toBeGreaterThan(0)
    expect(dataset.success.execution.kind).toBe('snapshot')
    const options = await provider.getFilterOptions('task_statuses')
    expect(options.isSuccess()).toBe(true)
    expect(options.success.length).toBe(dataset.success.rows.length)
  })
})
