import {
  AnalyticsDatasetResult,
  AnalyticsExecutionRequest,
  AnalyticsFilterValue,
  AppError,
  Either,
} from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import { REDMINE_ANALYTICS_DATASETS } from '../src/analytics/manifest'
import { RedmineAnalyticsPaging } from '../src/analytics/paging'
import { RedmineAnalyticsProvider } from '../src/analytics/RedmineAnalyticsSource'
import { RedmineClient } from '../src/client/RedmineClient'
import statuses from './fixtures/issue_statuses.json'
import { MockHttpClient } from './helpers/MockHttpClient'

function snapshot(result: AnalyticsDatasetResult) {
  if (result.execution.kind !== 'snapshot') throw new Error('Expected snapshot')
  return result.execution
}
function manifest() {
  const result = REDMINE_ANALYTICS_DATASETS.find(
    (item) => item.id === 'redmine_projects',
  )
  if (result === undefined) throw new Error('Missing manifest')
  return result
}
function fixture() {
  const http = new MockHttpClient()
  http.setRoute('GET', '/issue_statuses.json', 200, statuses)
  return {
    http,
    provider: new RedmineAnalyticsProvider(
      new RedmineClient(http, {
        apiUrl: 'https://redmine.test',
        apiKey: 'reader',
      }),
    ),
  }
}

describe('Bounded analytics pages', () => {
  it('returns a continuation and closes traversal without claiming a remotely consistent snapshot', async () => {
    const paging = new RedmineAnalyticsPaging()
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        Either.success({
          rows: [{ id: 1 }, { id: 2 }],
          total: 3,
          offset: 0,
          limit: 2,
          atomic: false,
        }),
      )
      .mockResolvedValueOnce(
        Either.success({
          rows: [{ id: 3 }],
          total: 3,
          offset: 2,
          limit: 2,
          atomic: false,
        }),
      )
    const first = await paging.fetch(
      manifest(),
      {
        datasetId: 'redmine_projects',
        execution: { kind: 'snapshot', batchSize: 2 },
      },
      read,
    )
    expect(first.isSuccess()).toBe(true)
    const cursor = snapshot(first.success).continuation?.cursor
    expect(cursor).toBeDefined()
    const request = {
      datasetId: 'redmine_projects',
      execution: {
        kind: 'snapshot',
        batchSize: 2,
        cursor,
      } as AnalyticsExecutionRequest,
    }
    const last = await paging.fetch(manifest(), request, read)
    expect(snapshot(last.success)).toMatchObject({
      coverage: 'unverified',
      batch: { offset: 2, index: 1, finished: true, totalRows: 3 },
    })
    expect(last.success.rows).toEqual([{ id: 3 }])
    const retry = await paging.fetch(manifest(), request, read)
    expect(retry.success).toEqual(last.success)
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('retries a failed page without skipping it and rejects cursors from another scope/provider', async () => {
    const paging = new RedmineAnalyticsPaging()
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        Either.success({
          rows: [{ id: 1 }],
          total: 2,
          offset: 0,
          limit: 1,
          atomic: false,
        }),
      )
      .mockResolvedValueOnce(Either.failure(AppError.Http(503, 'temporary')))
      .mockResolvedValueOnce(
        Either.success({
          rows: [{ id: 2 }],
          total: 2,
          offset: 1,
          limit: 1,
          atomic: false,
        }),
      )
    const first = await paging.fetch(
      manifest(),
      {
        datasetId: 'redmine_projects',
        execution: { kind: 'snapshot', batchSize: 1 },
      },
      read,
    )
    const cursor = snapshot(first.success).continuation?.cursor
    const input = {
      datasetId: 'redmine_projects',
      execution: {
        kind: 'snapshot',
        batchSize: 1,
        cursor,
      } as AnalyticsExecutionRequest,
    }
    expect(
      (
        await paging.fetch(manifest(), { ...input, projectId: '2' }, read)
      ).isFailure(),
    ).toBe(true)
    expect(
      (
        await new RedmineAnalyticsPaging().fetch(manifest(), input, read)
      ).isFailure(),
    ).toBe(true)
    expect((await paging.fetch(manifest(), input, read)).isFailure()).toBe(true)
    const retry = await paging.fetch(manifest(), input, read)
    expect(retry.success.rows).toEqual([{ id: 2 }])
    expect(read.mock.calls.map((call) => call.at(0))).toEqual([0, 1, 1])
  })
  it.each([
    {
      name: 'duplicate IDs',
      page: {
        rows: [{ id: 1 }, { id: 1 }],
        total: 2,
        offset: 0,
        limit: 2,
        atomic: false,
      },
    },
    {
      name: 'empty page before total',
      page: { rows: [], total: 2, offset: 0, limit: 2, atomic: false },
    },
    {
      name: 'wrong offset',
      page: { rows: [{ id: 1 }], total: 2, offset: 1, limit: 2, atomic: false },
    },
    {
      name: 'missing total',
      page: { rows: [{ id: 1 }], offset: 0, limit: 2, atomic: false },
    },
  ])(
    'rejects $name rather than publishing complete coverage',
    async ({ page }) => {
      const result = await new RedmineAnalyticsPaging().fetch(
        manifest(),
        {
          datasetId: 'redmine_projects',
          execution: { kind: 'snapshot', batchSize: 2 },
        },
        async () => Either.success(page),
      )
      expect(result.isFailure()).toBe(true)
    },
  )
  it('rejects a changed remote total and a duplicate crossing a page boundary', async () => {
    for (const second of [
      { rows: [{ id: 2 }], total: 3, offset: 1, limit: 1, atomic: false },
      { rows: [{ id: 1 }], total: 2, offset: 1, limit: 1, atomic: false },
    ]) {
      const paging = new RedmineAnalyticsPaging()
      const first = await paging.fetch(
        manifest(),
        {
          datasetId: 'redmine_projects',
          execution: { kind: 'snapshot', batchSize: 1 },
        },
        async () =>
          Either.success({
            rows: [{ id: 1 }],
            total: 2,
            offset: 0,
            limit: 1,
            atomic: false,
          }),
      )
      const cursor = snapshot(first.success).continuation?.cursor
      expect(
        (
          await paging.fetch(
            manifest(),
            {
              datasetId: 'redmine_projects',
              execution: { kind: 'snapshot', batchSize: 1, cursor },
            },
            async () => Either.success(second),
          )
        ).isFailure(),
      ).toBe(true)
    }
  })
  it('expires inactive cursors without timers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)
    const paging = new RedmineAnalyticsPaging()
    const read = async () =>
      Either.success({
        rows: [{ id: 1 }],
        total: 2,
        offset: 0,
        limit: 1,
        atomic: false,
      })
    const first = await paging.fetch(
      manifest(),
      {
        datasetId: 'redmine_projects',
        execution: { kind: 'snapshot', batchSize: 1 },
      },
      read,
    )
    const cursor = snapshot(first.success).continuation?.cursor
    vi.mocked(Date.now).mockReturnValue(600001)
    expect(
      (
        await paging.fetch(
          manifest(),
          {
            datasetId: 'redmine_projects',
            execution: { kind: 'snapshot', batchSize: 1, cursor },
          },
          read,
        )
      ).isFailure(),
    ).toBe(true)
    vi.restoreAllMocks()
  })
})

describe('Redmine analytics capability', () => {
  it('lists the canonical JSON catalog without remote sampling', async () => {
    const { provider, http } = fixture()
    const result = await provider.listAnalyticsDatasets()
    expect(
      result.success.some((dataset) => dataset.id === 'redmine_issues'),
    ).toBe(true)
    expect(
      result.success.every((dataset) => dataset.sourceFormat === 'json'),
    ).toBe(true)
    expect(http.requests).toHaveLength(0)
  })
  it('returns native filter options and complete atomic dictionaries', async () => {
    const { provider } = fixture()
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issue_statuses',
    })
    expect(snapshot(result.success)).toMatchObject({
      coverage: 'complete',
      batch: { finished: true, offset: 0 },
    })
    const options = await provider.getFilterOptions('task_statuses')
    expect(options.success).toEqual(
      statuses.issue_statuses.map((status) => ({
        value: String(status.id),
        label: status.name,
      })),
    )
  })
  it('forwards users 403 without fetching projects or memberships', async () => {
    const { provider, http } = fixture()
    http.setRoute('GET', '/users.json', 403, {})
    const result = await provider.getFilterOptions('members')
    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(403)
    expect(http.requests.map((request) => request.url)).toEqual(['/users.json'])
  })
  it('requires explicit parent scopes without project/issue scans', async () => {
    const { provider, http } = fixture()
    for (const datasetId of [
      'redmine_versions',
      'redmine_memberships',
      'redmine_issue_categories',
      'redmine_issue_journals',
      'redmine_issue_relations',
    ])
      expect(
        (await provider.fetchAnalyticsDataset({ datasetId })).isFailure(),
      ).toBe(true)
    expect(http.requests).toHaveLength(0)
  })
  it('rejects unsupported extraction modes and batch limits', async () => {
    const { provider } = fixture()
    for (const execution of [
      { kind: 'changes', checkpoint: '2026-11-01T00:00:00Z' },
      { kind: 'snapshot', batchSize: 0 },
      { kind: 'snapshot', batchSize: 101 },
      { kind: 'snapshot', cursor: 'foreign' },
    ] as AnalyticsExecutionRequest[])
      expect(
        (
          await provider.fetchAnalyticsDataset({
            datasetId: 'redmine_projects',
            execution,
          })
        ).isFailure(),
      ).toBe(true)
  })
})

describe('Native extraction fields and filters', () => {
  it('preserves custom field IDs across language changes and does not fabricate issue metadata', async () => {
    const { provider, http } = fixture()
    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 7,
          project: { id: 2, name: 'Projeto' },
          subject: 'Task',
          status: { id: 1, name: '任意' },
          created_on: '2026-11-01T12:00:00Z',
          updated_on: '2026-11-01T12:00:00Z',
          custom_fields: [{ id: 42, name: '任意', value: ['A', 'B'] }],
        },
      ],
      total_count: 1,
      offset: 0,
      limit: 100,
    })
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      filters: { assigned_to_id: ['1', '2'] },
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    })
    expect(result.isSuccess()).toBe(true)
    expect(result.success.rows).toMatchObject([
      {
        id: 7,
        project_id: 2,
        status_id: 1,
        is_closed: null,
        custom_field_42: '["A","B"]',
      },
    ])
    expect(
      result.success.dataset.columns.find(
        (column) => column.name === 'custom_field_42',
      ),
    ).toMatchObject({
      providerFieldId: '42',
      origin: 'custom',
      type: 'string',
      label: '任意',
    })
    expect(
      http.requests.find((request) => request.url === '/issues.json')?.params,
    ).toMatchObject({
      assigned_to_id: '=1|2',
      created_on: '><2026-11-01|2026-11-30',
      limit: '100',
      offset: '0',
    })
  })
  it('fails invalid, unsupported and named filters before accessing HTTP', async () => {
    const { provider, http } = fixture()
    const invalidFilters: Array<Record<string, AnalyticsFilterValue>> = [
      { user_id: 'Carlos' },
      { user_id: false },
      { activity_id: 'me' },
      { unexpected: '1' },
      { date_range: { from: '2026-01-01', to: '2026-01-31' } },
    ]
    for (const filters of invalidFilters)
      expect(
        (
          await provider.fetchAnalyticsDataset({
            datasetId: 'redmine_time_entries',
            filters,
          })
        ).isFailure(),
      ).toBe(true)
    expect(http.requests).toHaveLength(0)
  })
  it('discovers only native IDs from bounded Atom and enriches them in one REST request', async () => {
    const http = new MockHttpClient()
    http.setRoute(
      'GET',
      'activity.atom',
      200,
      '<feed><entry><id>https://redmine.test/issues/7#change-9</id><updated>2026-11-01T12:00:00Z</updated></entry><entry><id>https://redmine.test/issues/7</id><updated>2026-11-01T12:00:00Z</updated></entry></feed>',
    )
    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 7,
          project: { id: 2, name: 'Project' },
          subject: 'Task',
          status: { id: 1, name: 'New' },
          created_on: '2026-11-01T12:00:00Z',
          updated_on: '2026-11-01T12:00:00Z',
        },
      ],
      total_count: 1,
      offset: 0,
      limit: 100,
    })
    const provider = new RedmineAnalyticsProvider(
      new RedmineClient(http, {
        apiUrl: 'https://redmine.test',
        apiKey: 'reader',
        atomKey: 'feed',
      }),
    )
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issue_discovery',
      projectId: '2',
    })
    expect(result.success.rows).toMatchObject([{ id: 7 }])
    expect(snapshot(result.success)).toMatchObject({
      coverage: 'unverified',
      coverageReason: 'REDMINE_ATOM_FEED_LIMITED',
    })
    expect(http.requests.map((request) => request.url)).toEqual([
      'activity.atom',
      '/issues.json',
    ])
    expect(
      http.requests.find((request) => request.url === '/issues.json')?.params,
    ).toMatchObject({ issue_id: '7', status_id: '*' })
  })
})

describe('Analytics scan admission limits', () => {
  it('bounds active reads and refuses a collection beyond the configured identity budget', async () => {
    const paging = new RedmineAnalyticsPaging()
    const read = vi.fn(async () =>
      Either.success({
        rows: [{ id: 1 }],
        total: 2,
        offset: 0,
        limit: 1,
        atomic: false,
      }),
    )
    for (let index = 1; index <= 16; index += 1)
      expect(
        (
          await paging.fetch(
            manifest(),
            {
              datasetId: 'redmine_projects',
              projectId: String(index),
              execution: { kind: 'snapshot', batchSize: 1 },
            },
            read,
          )
        ).isSuccess(),
      ).toBe(true)
    const denied = await paging.fetch(
      manifest(),
      {
        datasetId: 'redmine_projects',
        projectId: '17',
        execution: { kind: 'snapshot', batchSize: 1 },
      },
      read,
    )
    expect(denied.failure.statusCode).toBe(429)
    expect(read).toHaveBeenCalledTimes(16)
    const tooLarge = await new RedmineAnalyticsPaging().fetch(
      manifest(),
      { datasetId: 'redmine_projects' },
      async () =>
        Either.success({
          rows: [{ id: 1 }],
          total: 50001,
          offset: 0,
          limit: 100,
          atomic: false,
        }),
    )
    expect(tooLarge.isFailure()).toBe(true)
  })
  it('does not consume read slots when the initial request fails', async () => {
    const paging = new RedmineAnalyticsPaging()
    for (let index = 0; index < 20; index += 1)
      expect(
        (
          await paging.fetch(
            manifest(),
            { datasetId: 'redmine_projects' },
            async () => Either.failure(AppError.Http(503, 'failed')),
          )
        ).isFailure(),
      ).toBe(true)
    const success = await paging.fetch(
      manifest(),
      { datasetId: 'redmine_projects' },
      async () => Either.success({ rows: [], atomic: true }),
    )
    expect(success.isSuccess()).toBe(true)
  })
})

describe('Equivalent concurrent continuations', () => {
  it('coalesces the same cursor when request properties are ordered differently', async () => {
    const paging = new RedmineAnalyticsPaging()
    const first = await paging.fetch(
      manifest(),
      {
        datasetId: 'redmine_projects',
        projectId: '1',
        execution: { kind: 'snapshot', batchSize: 1 },
      },
      async () =>
        Either.success({
          rows: [{ id: 1 }],
          total: 2,
          offset: 0,
          limit: 1,
          atomic: false,
        }),
    )
    const cursor = snapshot(first.success).continuation?.cursor
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const read = vi.fn(async (offset: number) => {
      await gate
      return Either.success({
        rows: [{ id: 2 }],
        total: 2,
        offset,
        limit: 1,
        atomic: false,
      })
    })
    const one = paging.fetch(
      manifest(),
      {
        datasetId: 'redmine_projects',
        projectId: '1',
        execution: { kind: 'snapshot', batchSize: 1, cursor },
      },
      read,
    )
    const two = paging.fetch(
      manifest(),
      {
        execution: { cursor, batchSize: 1, kind: 'snapshot' },
        projectId: '1',
        datasetId: 'redmine_projects',
      },
      read,
    )
    release()
    const outcomes = await Promise.all([one, two])
    expect(outcomes.every((outcome) => outcome.isSuccess())).toBe(true)
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('Phase 3 dataset declarations, checkpoints and changes', () => {
  it('declares canonical selection and extraction descriptors without date_range filters', async () => {
    const { provider } = fixture()
    const listed = await provider.listAnalyticsDatasets()
    expect(listed.isSuccess()).toBe(true)

    const timeEntries = listed.success.find(
      (item) => item.id === 'redmine_time_entries',
    )
    expect(timeEntries).toMatchObject({
      selection: { dateRange: true, project: true },
      extraction: {
        modes: ['snapshot'],
        identity: { kind: 'row', columns: ['id'] },
        windowRescan: { dateColumn: 'date' },
      },
    })
    expect(
      timeEntries?.supportedFilters?.some(
        (filter) => filter.id === 'date_range',
      ),
    ).toBe(false)

    const issues = listed.success.find((item) => item.id === 'redmine_issues')
    expect(issues).toMatchObject({
      selection: { dateRange: true, project: true },
      extraction: {
        modes: ['snapshot', 'changes'],
        identity: { kind: 'row', columns: ['id'] },
        changes: { deletions: 'none' },
      },
    })
    expect(issues?.supportedFilters?.map((filter) => filter.id)).toEqual([
      'project_id',
      'assigned_to_id',
      'status_id',
      'tracker_id',
      'closed_date_range',
      'updated_date_range',
    ])

    const discovery = listed.success.find(
      (item) => item.id === 'redmine_issue_discovery',
    )
    expect(discovery?.extraction).toEqual({
      modes: ['snapshot'],
      identity: { kind: 'row', columns: ['id'] },
    })
  })

  it('rejects invalid primary dates, invalid secondary date filters, and invalid changes checkpoints before HTTP', async () => {
    const { provider, http } = fixture()

    const badStartDate = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_time_entries',
      startDate: '2026-02-30',
      endDate: '2026-03-01',
    })
    expect(badStartDate.isFailure()).toBe(true)
    expect(badStartDate.failure.messageKey).toBe(
      'ANALYTICS_DATE_FILTER_INVALID',
    )

    const invertedRange = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_time_entries',
      startDate: '2026-11-10',
      endDate: '2026-11-01',
    })
    expect(invertedRange.isFailure()).toBe(true)
    expect(invertedRange.failure.messageKey).toBe(
      'ANALYTICS_DATE_RANGE_INVALID',
    )

    const badSecondaryDate = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      filters: {
        closed_date_range: { from: '2026-02-30' },
      },
    })
    expect(badSecondaryDate.isFailure()).toBe(true)
    expect(badSecondaryDate.failure.messageKey).toBe(
      'ANALYTICS_DATE_FILTER_INVALID',
    )

    for (const datasetId of [
      'redmine_time_entries',
      'redmine_issue_discovery',
    ]) {
      const unsupportedChanges = await provider.fetchAnalyticsDataset({
        datasetId,
        execution: {
          kind: 'changes',
          checkpoint: '2026-11-01T00:00:00Z',
        },
      })
      expect(unsupportedChanges.isFailure()).toBe(true)
      expect(unsupportedChanges.failure.messageKey).toBe(
        'ANALYTICS_EXECUTION_NOT_SUPPORTED',
      )
    }

    for (const badCheckpoint of ['', '   ', 'delta', '2026-02-30']) {
      const invalidCheckpoint = await provider.fetchAnalyticsDataset({
        datasetId: 'redmine_issues',
        execution: {
          kind: 'changes',
          checkpoint: badCheckpoint,
        },
      })
      expect(invalidCheckpoint.isFailure()).toBe(true)
      expect(invalidCheckpoint.failure.messageKey).toBe(
        'ANALYTICS_CHANGES_CHECKPOINT_INVALID',
      )
    }

    expect(http.requests).toHaveLength(0)
  })

  it('emits max(updated_date) checkpoint on final redmine_issues snapshot batch and omits checkpoint when empty', async () => {
    const http = new MockHttpClient()
    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 10,
          project: { id: 1, name: 'Core' },
          subject: 'First newer update',
          status: { id: 1, name: 'New' },
          created_on: '2026-11-01T09:00:00Z',
          updated_on: '2026-11-05T14:30:00Z',
        },
      ],
      total_count: 2,
      offset: 0,
      limit: 1,
    })
    const provider = new RedmineAnalyticsProvider(
      new RedmineClient(http, {
        apiUrl: 'https://redmine.test',
        apiKey: 'reader',
      }),
    )

    const page0 = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      execution: { kind: 'snapshot', batchSize: 1 },
    })
    expect(page0.isSuccess()).toBe(true)
    expect(snapshot(page0.success).coverage).toBe('partial')
    expect(snapshot(page0.success).checkpoint).toBeUndefined()

    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 11,
          project: { id: 1, name: 'Core' },
          subject: 'Second older update',
          status: { id: 1, name: 'New' },
          created_on: '2026-11-01T09:00:00Z',
          updated_on: '2026-11-02T08:00:00Z',
        },
      ],
      total_count: 2,
      offset: 1,
      limit: 1,
    })

    const page1 = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      execution: {
        kind: 'snapshot',
        batchSize: 1,
        cursor: snapshot(page0.success).continuation?.cursor,
      },
    })
    expect(page1.isSuccess()).toBe(true)
    expect(snapshot(page1.success)).toMatchObject({
      coverage: 'unverified',
      coverageReason: 'REDMINE_REMOTE_SNAPSHOT_UNAVAILABLE',
      checkpoint: '2026-11-05T14:30:00Z',
      batch: { finished: true, offset: 1, index: 1, totalRows: 2 },
    })

    http.setRoute('GET', '/issues.json', 200, {
      issues: [],
      total_count: 0,
      offset: 0,
      limit: 100,
    })
    const emptySnapshot = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      projectId: '99',
    })
    expect(emptySnapshot.isSuccess()).toBe(true)
    expect(snapshot(emptySnapshot.success).coverage).toBe('complete')
    expect(snapshot(emptySnapshot.success).checkpoint).toBeUndefined()
  })

  it('paginates redmine_issues changes preserving scope filters, partial/unverified coverage, and advancing checkpoint only on EOF', async () => {
    const http = new MockHttpClient()
    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 21,
          project: { id: 3, name: 'Platform' },
          subject: 'Updated first',
          status: { id: 2, name: 'In Progress' },
          created_on: '2026-11-01T10:00:00Z',
          updated_on: '2026-11-03T12:00:00Z',
        },
      ],
      total_count: 2,
      offset: 0,
      limit: 1,
    })
    const provider = new RedmineAnalyticsProvider(
      new RedmineClient(http, {
        apiUrl: 'https://redmine.test',
        apiKey: 'reader',
      }),
    )

    const baseInput = {
      datasetId: 'redmine_issues',
      projectId: '3',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      filters: {
        assigned_to_id: ['7'],
        status_id: '*',
        tracker_id: '2',
        closed_date_range: { from: '2026-11-01', to: '2026-11-20' },
      },
    }

    const batch0 = await provider.fetchAnalyticsDataset({
      ...baseInput,
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-01T10:00:00Z',
        batchSize: 1,
      },
    })
    expect(batch0.isSuccess()).toBe(true)
    expect(batch0.success.execution).toMatchObject({
      kind: 'changes',
      checkpoint: '2026-11-01T10:00:00Z',
      deletedIds: [],
      coverage: 'partial',
      batch: { index: 0, offset: 0, finished: false, totalRows: 2 },
    })

    if (batch0.success.execution.kind !== 'changes')
      throw new Error('Expected changes execution')

    const cursor = batch0.success.execution.continuation?.cursor
    expect(cursor).toBeDefined()

    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 22,
          project: { id: 3, name: 'Platform' },
          subject: 'Updated second',
          status: { id: 5, name: 'Closed' },
          created_on: '2026-11-02T10:00:00Z',
          updated_on: '2026-11-04T18:15:00Z',
          closed_on: '2026-11-04T18:15:00Z',
        },
      ],
      total_count: 2,
      offset: 1,
      limit: 1,
    })

    const batch1 = await provider.fetchAnalyticsDataset({
      ...baseInput,
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-01T10:00:00Z',
        batchSize: 1,
        cursor,
      },
    })
    expect(batch1.isSuccess()).toBe(true)
    expect(batch1.success.execution).toMatchObject({
      kind: 'changes',
      checkpoint: '2026-11-04T18:15:00Z',
      deletedIds: [],
      coverage: 'unverified',
      coverageReason: 'REDMINE_REMOTE_SNAPSHOT_UNAVAILABLE',
      batch: { index: 1, offset: 1, finished: true, totalRows: 2 },
    })
    expect(batch1.success.execution.continuation).toBeUndefined()

    expect(http.requests).toHaveLength(2)
    expect(http.requests.at(0)?.params).toMatchObject({
      project_id: '3',
      assigned_to_id: '7',
      status_id: '*',
      tracker_id: '2',
      created_on: '><2026-11-01|2026-11-30',
      closed_on: '><2026-11-01|2026-11-20',
      updated_on: '>=2026-11-01T10:00:00Z',
      sort: 'id:asc',
      limit: '1',
      offset: '0',
    })
  })

  it('intersects checkpoint with updated_date_range and skips HTTP on empty intersection', async () => {
    const http = new MockHttpClient()
    http.setRoute('GET', '/issues.json', 200, {
      issues: [],
      total_count: 0,
      offset: 0,
      limit: 100,
    })
    const provider = new RedmineAnalyticsProvider(
      new RedmineClient(http, {
        apiUrl: 'https://redmine.test',
        apiKey: 'reader',
      }),
    )

    const emptyWindow = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      filters: { updated_date_range: { to: '2026-10-31' } },
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-01T10:00:00Z',
      },
    })
    expect(emptyWindow.isSuccess()).toBe(true)
    expect(emptyWindow.success.rows).toEqual([])
    expect(emptyWindow.success.execution).toMatchObject({
      kind: 'changes',
      checkpoint: '2026-11-01T10:00:00Z',
      deletedIds: [],
      coverage: 'complete',
      batch: { index: 0, offset: 0, finished: true, totalRows: 0 },
    })
    expect(http.requests).toHaveLength(0)

    const widerFrom = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      filters: {
        updated_date_range: { from: '2026-10-15', to: '2026-11-10' },
      },
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-01T10:00:00Z',
      },
    })
    expect(widerFrom.isSuccess()).toBe(true)
    expect(widerFrom.success.execution).toMatchObject({
      kind: 'changes',
      checkpoint: '2026-11-01T10:00:00Z',
      coverage: 'complete',
    })
    expect(http.requests.at(0)?.params?.updated_on).toBe(
      '><2026-11-01T10:00:00Z|2026-11-10',
    )

    const tighterFrom = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      filters: {
        updated_date_range: { from: '2026-11-05', to: '2026-11-10' },
      },
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-01T10:00:00Z',
      },
    })
    expect(tighterFrom.isSuccess()).toBe(true)
    expect(http.requests.at(1)?.params?.updated_on).toBe(
      '><2026-11-05|2026-11-10',
    )
  })

  it('fails incremental changes scan if remote total_count mutates between pages', async () => {
    const http = new MockHttpClient()
    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 31,
          project: { id: 1, name: 'Core' },
          subject: 'Item 1',
          status: { id: 1, name: 'New' },
          created_on: '2026-11-01T00:00:00Z',
          updated_on: '2026-11-02T00:00:00Z',
        },
      ],
      total_count: 2,
      offset: 0,
      limit: 1,
    })
    const provider = new RedmineAnalyticsProvider(
      new RedmineClient(http, {
        apiUrl: 'https://redmine.test',
        apiKey: 'reader',
      }),
    )

    const first = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-01T00:00:00Z',
        batchSize: 1,
      },
    })
    expect(first.isSuccess()).toBe(true)
    if (first.success.execution.kind !== 'changes')
      throw new Error('Expected changes execution')

    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 32,
          project: { id: 1, name: 'Core' },
          subject: 'Item 2',
          status: { id: 1, name: 'New' },
          created_on: '2026-11-01T00:00:00Z',
          updated_on: '2026-11-03T00:00:00Z',
        },
      ],
      total_count: 3,
      offset: 1,
      limit: 1,
    })

    const second = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-01T00:00:00Z',
        batchSize: 1,
        cursor: first.success.execution.continuation?.cursor,
      },
    })
    expect(second.isFailure()).toBe(true)
    expect(second.failure.messageKey).toBe('ANALYTICS_COLLECTION_CHANGED')
  })

  it('preserves same-second tie ordering across pages with sort id:asc and retains equal checkpoint without loss', async () => {
    const http = new MockHttpClient()
    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 40,
          project: { id: 1, name: 'Core' },
          subject: 'Tie first',
          status: { id: 1, name: 'New' },
          created_on: '2026-11-01T00:00:00Z',
          updated_on: '2026-11-04T18:15:00Z',
        },
      ],
      total_count: 2,
      offset: 0,
      limit: 1,
    })

    const provider = new RedmineAnalyticsProvider(
      new RedmineClient(http, {
        apiUrl: 'https://redmine.test',
        apiKey: 'reader',
      }),
    )

    const page0 = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-04T18:15:00Z',
        batchSize: 1,
      },
    })
    expect(page0.isSuccess()).toBe(true)
    if (page0.success.execution.kind !== 'changes')
      throw new Error('Expected changes execution')

    http.setRoute('GET', '/issues.json', 200, {
      issues: [
        {
          id: 41,
          project: { id: 1, name: 'Core' },
          subject: 'Tie second',
          status: { id: 1, name: 'New' },
          created_on: '2026-11-01T00:00:00Z',
          updated_on: '2026-11-04T18:15:00Z',
        },
      ],
      total_count: 2,
      offset: 1,
      limit: 1,
    })

    const page1 = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
      execution: {
        kind: 'changes',
        checkpoint: '2026-11-04T18:15:00Z',
        batchSize: 1,
        cursor: page0.success.execution.continuation?.cursor,
      },
    })
    expect(page1.isSuccess()).toBe(true)
    expect(page0.success.rows.map((row) => row.id)).toEqual([40])
    expect(page1.success.rows.map((row) => row.id)).toEqual([41])
    expect(http.requests.map((req) => req.params?.sort)).toEqual([
      'id:asc',
      'id:asc',
    ])
    expect(page1.success.execution).toMatchObject({
      kind: 'changes',
      checkpoint: '2026-11-04T18:15:00Z',
      deletedIds: [],
    })
  })
})

describe('Unsupported selection boundaries', () => {
  it.each([
    { projectId: '999' },
    { startDate: '2026-01-01', endDate: '2026-12-31' },
  ])('rejects ignored journal selection %j before HTTP', async (selection) => {
    const { provider, http } = fixture()
    http.setRoute('GET', '/issues/7.json', 200, {
      issue: {
        id: 7,
        project: { id: 2, name: 'Actual project' },
        subject: 'Task',
        status: { id: 1, name: 'New' },
        created_on: '2026-11-01T00:00:00Z',
        updated_on: '2026-11-01T00:00:00Z',
        journals: [],
      },
    })
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issue_journals',
      filters: { issue_id: '7' },
      ...selection,
    })
    expect(result.isFailure()).toBe(true)
    expect(http.requests).toHaveLength(0)
  })
})
