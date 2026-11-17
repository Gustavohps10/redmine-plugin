import { describe, expect, it } from 'vitest'

import { BoundedAnalyticsHttpClient } from '../../src/analytics/BoundedAnalyticsHttpClient'
import { RedmineAnalyticsProvider } from '../../src/analytics/RedmineAnalyticsSource'
import { RedmineClient } from '../../src/client/RedmineClient'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

describe.each([
  { version: '3.4', port: 3030 },
  { version: '5.1', port: 3051 },
  { version: '6.0', port: 3060 },
])('Analytics extraction matrix $version', ({ version, port }) => {
  const create = () =>
    new RedmineAnalyticsProvider(
      new RedmineClient(
        BoundedAnalyticsHttpClient.create(new AxiosHttpClient()),
        {
          apiUrl: `http://127.0.0.1:${port}`,
          apiKey: 'testapikeyredmine1234567890abcdef',
          atomKey: 'testatomkeyredmine1234567890abcdef',
          version,
        },
      ),
    )
  it('returns bounded REST pages, native identities and explicit traversal coverage', async () => {
    const provider = create()
    const ids = new Set<number>()
    let cursor: string | undefined
    let sawContinuation = false
    let finished = false
    const started = performance.now()
    let pageCount = 0
    let observedTotal: number | undefined
    let peakHeapBytes = process.memoryUsage().heapUsed

    for (let page = 0; page < 150; page += 1) {
      pageCount += 1
      const result = await provider.fetchAnalyticsDataset({
        datasetId: 'redmine_time_entries',
        execution: { kind: 'snapshot', batchSize: 100, cursor },
      })
      if (result.isFailure()) {
        expect(version).toBe('3.4')
        expect(result.failure.messageKey).toBe(
          'ANALYTICS_DUPLICATE_ROW_IDENTITY',
        )
        finished = true
        break
      }
      expect(result.success.rows.length).toBeLessThanOrEqual(100)
      for (const row of result.success.rows) {
        expect(typeof row.id).toBe('number')
        if (typeof row.id !== 'number') throw new Error('Native ID missing')
        expect(ids.has(row.id)).toBe(false)
        ids.add(row.id)
      }
      const execution = result.success.execution
      if (execution.kind !== 'snapshot') throw new Error('Expected snapshot')
      observedTotal = execution.batch?.totalRows
      peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed)
      if (process.env.MR_TICK_ANALYTICS_ENTERPRISE === '1')
        expect(observedTotal).toBeGreaterThanOrEqual(3000)
      if (execution.continuation === undefined) {
        expect(execution.batch?.finished).toBe(true)
        expect(execution.coverage).toBe('unverified')
        expect(ids.size).toBe(execution.batch?.totalRows)
        finished = true
        break
      }
      sawContinuation = true
      expect(execution.coverage).toBe('partial')
      cursor = execution.continuation.cursor
    }
    expect(sawContinuation).toBe(true)
    expect(finished).toBe(true)
    console.info(
      JSON.stringify({
        version,
        pages: pageCount,
        acceptedRows: ids.size,
        observedTotal,
        elapsedMs: Math.round(performance.now() - started),
        peakHeapMiB: Math.round(peakHeapBytes / 1048576),
      }),
    )
  }, 120000)
  it('reads bounded Atom discovery without claiming a complete feed', async () => {
    const result = await create().fetchAnalyticsDataset({
      datasetId: 'redmine_issue_discovery',
    })
    expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    expect(result.success.execution).toMatchObject({
      coverage: 'unverified',
      coverageReason: 'REDMINE_ATOM_FEED_LIMITED',
    })
    expect(result.success.rows.length).toBeLessThanOrEqual(100)
  }, 120000)
  it('reads every scoped dataset without implicit project/member scans', async () => {
    const provider = create()
    const projects = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_projects',
    })
    const issues = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_issues',
    })
    expect(projects.isSuccess()).toBe(true)
    expect(issues.isSuccess()).toBe(true)
    const project = projects.success.rows.find(
      (row) => typeof row.id === 'number',
    )
    const issue = issues.success.rows.find((row) => typeof row.id === 'number')
    if (project === undefined || issue === undefined)
      throw new Error('Seed records missing')
    for (const datasetId of [
      'redmine_versions',
      'redmine_memberships',
      'redmine_issue_categories',
    ]) {
      const result = await provider.fetchAnalyticsDataset({
        datasetId,
        projectId: String(project.id),
      })
      expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    }
    for (const datasetId of [
      'redmine_issue_journals',
      'redmine_issue_relations',
    ]) {
      const result = await provider.fetchAnalyticsDataset({
        datasetId,
        filters: { issue_id: String(issue.id) },
      })
      expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    }
    for (const datasetId of [
      'redmine_issue_statuses',
      'redmine_trackers',
      'redmine_activities',
      'redmine_priorities',
      'redmine_queries',
      'redmine_users',
      'redmine_groups',
    ]) {
      const result = await provider.fetchAnalyticsDataset({ datasetId })
      expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    }
  }, 120000)

  it('extracts redmine_issues snapshot checkpoint and incremental changes without mutations', async () => {
    const provider = create()
    const snapshotIds = new Set<number>()
    const updatedTimestamps: string[] = []
    let cursor: string | undefined
    let initialCheckpoint: string | undefined

    for (let page = 0; page < 50; page += 1) {
      const result = await provider.fetchAnalyticsDataset({
        datasetId: 'redmine_issues',
        execution: { kind: 'snapshot', batchSize: 100, cursor },
      })
      expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
      if (result.isFailure()) return

      for (const row of result.success.rows) {
        if (typeof row.id !== 'number') throw new Error('Issue ID missing')
        expect(snapshotIds.has(row.id)).toBe(false)
        snapshotIds.add(row.id)

        if (typeof row.updated_date === 'string')
          updatedTimestamps.push(row.updated_date)
      }

      if (result.success.execution.kind !== 'snapshot')
        throw new Error('Expected snapshot execution')

      if (result.success.execution.continuation === undefined) {
        initialCheckpoint = result.success.execution.checkpoint
        break
      }

      cursor = result.success.execution.continuation.cursor
    }

    expect(snapshotIds.size).toBeGreaterThan(0)
    expect(typeof initialCheckpoint).toBe('string')
    if (initialCheckpoint === undefined) return

    const sortedTimestamps = [...new Set(updatedTimestamps)].sort(
      (left, right) => Date.parse(left) - Date.parse(right),
    )
    let checkpoint = initialCheckpoint
    if (sortedTimestamps.length > 1)
      checkpoint = sortedTimestamps[Math.floor(sortedTimestamps.length / 2)]!

    const deltaIds = new Set<number>()
    let deltaCursor: string | undefined
    let finalDeltaCheckpoint: string | undefined

    for (let page = 0; page < 50; page += 1) {
      const result = await provider.fetchAnalyticsDataset({
        datasetId: 'redmine_issues',
        execution: {
          kind: 'changes',
          checkpoint,
          batchSize: 100,
          cursor: deltaCursor,
        },
      })
      expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
      if (result.isFailure()) return

      const execution = result.success.execution
      if (execution.kind !== 'changes')
        throw new Error('Expected changes execution')

      expect(execution.deletedIds).toEqual([])

      for (const row of result.success.rows) {
        if (typeof row.id !== 'number')
          throw new Error('Delta issue ID missing')
        expect(deltaIds.has(row.id)).toBe(false)
        deltaIds.add(row.id)
      }

      if (execution.continuation === undefined) {
        finalDeltaCheckpoint = execution.checkpoint
        break
      }

      deltaCursor = execution.continuation.cursor
    }

    expect(deltaIds.size).toBeGreaterThan(0)
    expect(deltaIds.size).toBeLessThanOrEqual(snapshotIds.size)
    expect(typeof finalDeltaCheckpoint).toBe('string')
  }, 120000)

  it('extracts 14-day spent_on rolling window slice on redmine_time_entries', async () => {
    const provider = create()
    const probe = await provider.fetchAnalyticsDataset({
      datasetId: 'redmine_time_entries',
      execution: { kind: 'snapshot', batchSize: 20 },
    })
    expect(probe.isSuccess(), JSON.stringify(probe)).toBe(true)
    if (probe.isFailure()) return

    const anchorRow = probe.success.rows.find(
      (row) => typeof row.date === 'string',
    )
    if (anchorRow === undefined || typeof anchorRow.date !== 'string')
      throw new Error('Time entry date missing in seed')

    const endDate = anchorRow.date
    const endDateObj = new Date(`${endDate}T00:00:00Z`)
    endDateObj.setUTCDate(endDateObj.getUTCDate() - 13)
    const startDate = endDateObj.toISOString().slice(0, 10)

    const windowIds = new Set<number>()
    let cursor: string | undefined
    let finished = false

    for (let page = 0; page < 50; page += 1) {
      const result = await provider.fetchAnalyticsDataset({
        datasetId: 'redmine_time_entries',
        startDate,
        endDate,
        execution: { kind: 'snapshot', batchSize: 100, cursor },
      })

      if (result.isFailure()) {
        expect(version).toBe('3.4')
        expect(result.failure.messageKey).toBe(
          'ANALYTICS_DUPLICATE_ROW_IDENTITY',
        )
        finished = true
        break
      }

      for (const row of result.success.rows) {
        if (typeof row.id !== 'number' || typeof row.date !== 'string')
          throw new Error('Window row fields missing')

        expect(row.date >= startDate && row.date <= endDate).toBe(true)
        expect(windowIds.has(row.id)).toBe(false)
        windowIds.add(row.id)
      }

      if (result.success.execution.kind !== 'snapshot')
        throw new Error('Expected snapshot execution')

      if (result.success.execution.continuation === undefined) {
        finished = true
        break
      }

      cursor = result.success.execution.continuation.cursor
    }

    expect(finished).toBe(true)
    expect(windowIds.size).toBeGreaterThan(0)
  }, 120000)

  it('extracts multi-month recent reconciliation window on redmine_time_entries with adaptive subdivision on 3.4', async () => {
    const provider = create()
    const startDate = '2026-09-01'
    const endDate = '2026-11-30'
    const recentIds = new Set<number>()
    let cursor: string | undefined
    let finished = false
    let expectedTotal: number | undefined

    for (let page = 0; page < 50; page += 1) {
      const result = await provider.fetchAnalyticsDataset({
        datasetId: 'redmine_time_entries',
        startDate,
        endDate,
        execution: { kind: 'snapshot', batchSize: 100, cursor },
      })
      expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
      if (result.isFailure()) return

      for (const row of result.success.rows) {
        if (typeof row.id !== 'number' || typeof row.date !== 'string')
          throw new Error('Recent window row fields missing')

        expect(row.date >= startDate && row.date <= endDate).toBe(true)
        expect(recentIds.has(row.id)).toBe(false)
        recentIds.add(row.id)
      }

      if (result.success.execution.kind !== 'snapshot')
        throw new Error('Expected snapshot execution')

      expectedTotal = result.success.execution.batch?.totalRows

      if (result.success.execution.continuation === undefined) {
        expect(result.success.execution.coverage).toBe('unverified')
        finished = true
        break
      }

      cursor = result.success.execution.continuation.cursor
    }

    expect(finished).toBe(true)
    expect(recentIds.size).toBeGreaterThan(100)
    expect(recentIds.size).toBe(expectedTotal)
  }, 120000)
})
