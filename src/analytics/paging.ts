import { randomUUID } from 'node:crypto'

import {
  AnalyticsColumnSchema,
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsDatasetRow,
  AnalyticsDatasetScope,
  AnalyticsFilterValue,
  AppError,
  createAnalyticsDatasetScope,
  Either,
} from '@mr-tick/sdk'

import { InFlightRequests } from '../client/InFlightRequests'
import { normalizeRedmineCheckpoint } from './helpers/filter-resolver'

export interface RedmineAnalyticsPage {
  rows: AnalyticsDatasetRow[]
  columns?: AnalyticsColumnSchema[]
  total?: number
  offset?: number
  limit?: number
  atomic: boolean
  unverifiedReason?: string
}

type ReadPage = (
  offset: number,
  limit: number,
  range?: { startDate: string; endDate: string },
) => Promise<Either<AppError, RedmineAnalyticsPage>>

interface TimeEntryRange {
  startDate: string
  endDate: string
  first: RedmineAnalyticsPage
  total: number
}

interface Scan {
  scopeKey: string
  batchSize: number
  offset: number
  index: number
  touched: number
  total?: number
  seen: Set<string>
  maxUpdatedDate?: string
  cursor: string
  previousCursor?: string
  previousResult?: AnalyticsDatasetResult
  ranges?: TimeEntryRange[]
}

function updateMaxTimestamp(
  current: string | undefined,
  rows: readonly AnalyticsDatasetRow[],
): string | undefined {
  let latest = current

  for (const row of rows) {
    const candidate = row.updated_date
    if (typeof candidate !== 'string') continue

    const candidateMs = Date.parse(candidate)
    if (!Number.isFinite(candidateMs)) continue

    if (latest === undefined || candidateMs > Date.parse(latest))
      latest = candidate
  }

  return latest
}

/** Bounded continuation state owned by a single authorized provider instance. */
export class RedmineAnalyticsPaging {
  private readonly scans = new Set<Scan>()
  private readonly inFlight = new InFlightRequests<
    Either<AppError, AnalyticsDatasetResult>
  >()

  public async fetch(
    manifest: AnalyticsDatasetManifest,
    input: AnalyticsDatasetQueryInput,
    read: ReadPage,
    splitTimeEntries = false,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    let kind: 'snapshot' | 'changes' = 'snapshot'
    let batchSize = 100
    let cursor: string | undefined
    let checkpoint: string | undefined

    if (input.execution !== undefined) {
      if (
        input.execution.kind !== 'snapshot' &&
        input.execution.kind !== 'changes'
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
        )

      kind = input.execution.kind
      cursor = input.execution.cursor
      if (input.execution.batchSize !== undefined)
        batchSize = input.execution.batchSize
      if (input.execution.kind === 'changes')
        checkpoint = input.execution.checkpoint
    }

    const key = JSON.stringify([
      selectionKey(input, kind, batchSize, checkpoint),
      kind,
      cursor,
    ])
    return this.inFlight.run(key, () =>
      this.read(manifest, input, read, splitTimeEntries),
    )
  }

  private async readPage(
    scan: Scan,
    input: AnalyticsDatasetQueryInput,
    read: ReadPage,
    split: boolean,
  ): Promise<
    Either<
      AppError,
      { page: RedmineAnalyticsPage; requests: number; retries: number }
    >
  > {
    let requests = 0
    let retries = 0

    const trackedRead: ReadPage = (offset, limit, range) => {
      requests += 1
      return read(offset, limit, range)
    }

    if (scan.ranges === undefined) {
      const original = await trackedRead(scan.offset, scan.batchSize)
      if (original.isFailure() || !split || scan.offset !== 0) {
        if (original.isFailure()) return original.forwardFailure()
        return Either.success({ page: original.success, requests, retries })
      }

      const { startDate, endDate } = input
      const page = original.success

      if (
        startDate === undefined ||
        endDate === undefined ||
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        startDate >= endDate ||
        page.total === undefined ||
        !Number.isSafeInteger(page.total) ||
        page.total <= scan.batchSize ||
        page.total > 50000 ||
        page.offset !== 0 ||
        page.atomic
      )
        return Either.success({ page, requests, retries })

      let remaining = 30
      let retriedSplit = false
      const ranges: TimeEntryRange[] = []

      const isSubsliceConsistent = (
        expectedTotal: number,
        leftPage: RedmineAnalyticsPage,
        rightPage: RedmineAnalyticsPage,
      ): boolean => {
        const leftTotal = leftPage.total
        const rightTotal = rightPage.total

        if (
          leftTotal === undefined ||
          rightTotal === undefined ||
          !Number.isSafeInteger(leftTotal) ||
          !Number.isSafeInteger(rightTotal) ||
          leftTotal < 0 ||
          rightTotal < 0
        )
          return false

        if (
          leftTotal + rightTotal !== expectedTotal ||
          leftPage.offset !== 0 ||
          rightPage.offset !== 0 ||
          leftPage.rows.length > leftTotal ||
          rightPage.rows.length > rightTotal ||
          (leftTotal > 0 && leftPage.rows.length === 0) ||
          (rightTotal > 0 && rightPage.rows.length === 0)
        )
          return false

        return true
      }

      const visit = async (
        range: TimeEntryRange,
      ): Promise<Either<AppError, null>> => {
        if (
          range.total <= scan.batchSize ||
          range.startDate === range.endDate ||
          remaining < 2
        ) {
          ranges.push(range)
          return Either.success(null)
        }

        const start = Date.parse(range.startDate)
        const end = Date.parse(range.endDate)
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
          return Either.failure(
            AppError.ValidationError('ANALYTICS_DATE_RANGE_INVALID'),
          )

        const dayMs = 86_400_000
        const middle = start + Math.floor((end - start) / dayMs / 2) * dayMs
        const left = {
          startDate: range.startDate,
          endDate: new Date(middle).toISOString().slice(0, 10),
        }
        const right = {
          startDate: new Date(middle + dayMs).toISOString().slice(0, 10),
          endDate: range.endDate,
        }

        remaining -= 2
        let first = await trackedRead(0, scan.batchSize, left)
        if (first.isFailure()) return first.forwardFailure()
        let second = await trackedRead(0, scan.batchSize, right)
        if (second.isFailure()) return second.forwardFailure()

        let expectedParentTotal = range.total

        if (
          !isSubsliceConsistent(
            expectedParentTotal,
            first.success,
            second.success,
          ) &&
          !retriedSplit &&
          remaining >= 3
        ) {
          retriedSplit = true
          retries += 1
          remaining -= 3
          const refreshedParent = await trackedRead(0, scan.batchSize, {
            startDate: range.startDate,
            endDate: range.endDate,
          })
          if (refreshedParent.isFailure())
            return refreshedParent.forwardFailure()

          const refreshedTotal = refreshedParent.success.total
          if (
            refreshedTotal !== undefined &&
            Number.isSafeInteger(refreshedTotal) &&
            refreshedTotal >= 0 &&
            refreshedTotal <= 50000
          )
            expectedParentTotal = refreshedTotal

          first = await trackedRead(0, scan.batchSize, left)
          if (first.isFailure()) return first.forwardFailure()
          second = await trackedRead(0, scan.batchSize, right)
          if (second.isFailure()) return second.forwardFailure()
        }

        const leftTotal = first.success.total
        const rightTotal = second.success.total

        if (
          leftTotal === undefined ||
          rightTotal === undefined ||
          !isSubsliceConsistent(
            expectedParentTotal,
            first.success,
            second.success,
          )
        )
          return Either.failure(
            AppError.ValidationError('ANALYTICS_COLLECTION_CHANGED'),
          )

        const earlier = await visit({
          ...left,
          first: first.success,
          total: leftTotal,
        })
        if (earlier.isFailure()) return earlier

        return visit({ ...right, first: second.success, total: rightTotal })
      }

      const planned = await visit({
        startDate,
        endDate,
        first: page,
        total: page.total,
      })
      if (planned.isFailure()) return planned.forwardFailure()

      scan.ranges = ranges
    }

    let offset = scan.offset
    const total = scan.ranges.reduce((sum, range) => sum + range.total, 0)

    for (const range of scan.ranges) {
      if (offset >= range.total) {
        offset -= range.total
        continue
      }

      let result: Either<AppError, RedmineAnalyticsPage> = Either.success(
        range.first,
      )

      if (offset > 0)
        result = await trackedRead(offset, scan.batchSize, {
          startDate: range.startDate,
          endDate: range.endDate,
        })

      if (result.isFailure()) return result.forwardFailure()
      let page = result.success

      if (
        offset > 0 &&
        (page.total !== range.total ||
          page.offset !== offset ||
          page.rows.length === 0 ||
          offset + page.rows.length > range.total)
      ) {
        retries += 1
        const retriedPage = await trackedRead(offset, scan.batchSize, {
          startDate: range.startDate,
          endDate: range.endDate,
        })
        if (retriedPage.isFailure()) return retriedPage.forwardFailure()
        page = retriedPage.success
      }

      if (
        page.total !== range.total ||
        page.offset !== offset ||
        page.rows.length === 0 ||
        offset + page.rows.length > range.total
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_COLLECTION_CHANGED'),
        )

      return Either.success({
        page: {
          ...page,
          offset: scan.offset,
          total,
          unverifiedReason: 'REDMINE_REMOTE_SNAPSHOT_UNAVAILABLE',
        },
        requests,
        retries,
      })
    }

    return Either.failure(
      AppError.ValidationError('ANALYTICS_PAGE_PREMATURE_END'),
    )
  }

  private async read(
    manifest: AnalyticsDatasetManifest,
    input: AnalyticsDatasetQueryInput,
    read: ReadPage,
    splitTimeEntries: boolean,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    const execution = input.execution
    let kind: 'snapshot' | 'changes' = 'snapshot'

    if (execution !== undefined) {
      if (execution.kind !== 'snapshot' && execution.kind !== 'changes')
        return Either.failure(
          AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
        )

      kind = execution.kind
    }

    if (!manifest.extraction.modes.includes(kind))
      return Either.failure(
        AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
      )

    let checkpointInput: string | undefined

    if (execution?.kind === 'changes') {
      const validated = normalizeRedmineCheckpoint(execution.checkpoint)
      if (validated.isFailure()) return validated.forwardFailure()

      checkpointInput = execution.checkpoint
    }

    let batchSize = 100
    if (
      (execution?.kind === 'snapshot' || execution?.kind === 'changes') &&
      execution.batchSize !== undefined
    )
      batchSize = execution.batchSize

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_BATCH_SIZE_INVALID'),
      )

    const scope = createAnalyticsDatasetScope(input)
    const scopeKey = selectionKey(input, kind, batchSize, checkpointInput)
    const now = Date.now()

    for (const item of this.scans) {
      if (now - item.touched > 600000) this.scans.delete(item)
    }

    let scan: Scan | undefined
    const cursor = execution?.cursor

    if (cursor !== undefined) {
      scan = Array.from(this.scans).find(
        (item) => item.cursor === cursor || item.previousCursor === cursor,
      )
      if (!scan || scan.scopeKey !== scopeKey)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_CURSOR_INVALID_OR_EXPIRED'),
        )

      scan.touched = now
      if (scan.previousCursor === cursor && scan.previousResult !== undefined)
        return Either.success(scan.previousResult)
    }

    if (scan === undefined) {
      for (const item of this.scans) {
        if (item.cursor === '' && this.scans.size >= 16) this.scans.delete(item)
      }

      if (this.scans.size >= 16)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_ACTIVE_SCANS_LIMIT'),
        )

      scan = {
        scopeKey,
        batchSize,
        offset: 0,
        index: 0,
        touched: now,
        seen: new Set(),
        cursor: randomUUID(),
      }
      this.scans.add(scan)
    }

    try {
      const page = await this.readPage(scan, input, read, splitTimeEntries)
      if (page.isFailure()) return page.forwardFailure()

      const data = page.success.page
      if (!data.atomic && data.rows.length > batchSize)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_SIZE_EXCEEDED'),
        )
      if (data.atomic && scan.offset > 0)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_CURSOR_NOT_SUPPORTED'),
        )
      if (data.offset !== undefined && data.offset !== scan.offset)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_OFFSET_MISMATCH'),
        )
      if (
        data.limit !== undefined &&
        (!Number.isInteger(data.limit) ||
          data.limit < 1 ||
          data.limit > batchSize)
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_LIMIT_INVALID'),
        )
      if (data.limit !== undefined && data.rows.length > data.limit)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_LIMIT_MISMATCH'),
        )
      if (
        data.total !== undefined &&
        (!Number.isInteger(data.total) || data.total < 0)
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_TOTAL_INVALID'),
        )
      if (data.total !== undefined && data.total > 50000)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_SCAN_ROWS_LIMIT'),
        )
      if (scan.total !== undefined && data.total !== scan.total)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_COLLECTION_CHANGED'),
        )

      const nextOffset = scan.offset + data.rows.length
      if (data.total !== undefined && nextOffset > data.total)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_TOTAL_MISMATCH'),
        )
      if (
        data.rows.length === 0 &&
        data.total !== undefined &&
        scan.offset < data.total
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_PREMATURE_END'),
        )
      if (nextOffset > 50000)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_SCAN_ROWS_LIMIT'),
        )

      const pageIds = new Set<string>()

      if (manifest.extraction.identity.kind === 'row') {
        for (const row of data.rows) {
          const parts = manifest.extraction.identity.columns.map(
            (column) => row[column],
          )
          if (parts.some((part) => part === undefined || part === null))
            return Either.failure(
              AppError.ValidationError('ANALYTICS_ROW_IDENTITY_MISSING'),
            )

          const id = JSON.stringify(parts)
          if (scan.seen.has(id) || pageIds.has(id))
            return Either.failure(
              AppError.ValidationError('ANALYTICS_DUPLICATE_ROW_IDENTITY'),
            )
          pageIds.add(id)
        }
      }

      let finished = data.atomic
      if (!data.atomic && data.total !== undefined)
        finished = nextOffset === data.total
      if (!data.atomic && data.total === undefined)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PAGE_TOTAL_REQUIRED'),
        )

      let coverage: 'complete' | 'partial' | 'unverified' = 'partial'
      let coverageReason: string | undefined

      if (finished) {
        coverage = 'complete'

        if (scan.index > 0 || data.unverifiedReason !== undefined) {
          coverage = 'unverified'
          coverageReason = 'REDMINE_REMOTE_SNAPSHOT_UNAVAILABLE'
          if (data.unverifiedReason !== undefined)
            coverageReason = data.unverifiedReason
        }
      }

      const nextMaxUpdated = updateMaxTimestamp(scan.maxUpdatedDate, data.rows)
      let continuation: { cursor: string } | undefined
      if (!finished) continuation = { cursor: randomUUID() }

      const resultExecution = buildExecutionResult({
        kind,
        manifest,
        scope,
        coverage,
        coverageReason,
        batch: {
          index: scan.index,
          offset: scan.offset,
          finished,
          totalRows: data.total,
        },
        continuation,
        checkpointInput,
        nextMaxUpdated,
        metrics: {
          requests: page.success.requests,
          retries: page.success.retries,
        },
      })

      const result: AnalyticsDatasetResult = {
        dataset: manifest,
        rows: data.rows,
        fetchedAt: new Date().toISOString(),
        execution: resultExecution,
      }

      if (data.columns !== undefined)
        result.dataset = {
          ...manifest,
          columns: [...manifest.columns, ...data.columns],
        }

      for (const id of pageIds) scan.seen.add(id)
      scan.total = data.total
      scan.offset = nextOffset
      scan.index += 1
      scan.touched = Date.now()
      scan.maxUpdatedDate = nextMaxUpdated
      scan.previousCursor = cursor
      scan.previousResult = result
      if (continuation !== undefined) scan.cursor = continuation.cursor

      if (finished) {
        scan.cursor = ''
        scan.seen.clear()
      }

      if (!finished || cursor !== undefined) this.scans.add(scan)

      return Either.success(result)
    } finally {
      if (cursor === undefined && (scan.offset === 0 || scan.cursor === ''))
        this.scans.delete(scan)
    }
  }
}

function buildExecutionResult(params: {
  kind: 'snapshot' | 'changes'
  manifest: AnalyticsDatasetManifest
  scope: AnalyticsDatasetScope
  coverage: 'complete' | 'partial' | 'unverified'
  coverageReason: string | undefined
  batch: {
    index: number
    offset: number
    finished: boolean
    totalRows: number | undefined
  }
  continuation: { cursor: string } | undefined
  checkpointInput: string | undefined
  nextMaxUpdated: string | undefined
  metrics: { requests: number; retries: number }
}): AnalyticsDatasetResult['execution'] {
  if (params.kind === 'changes' && params.checkpointInput !== undefined) {
    let responseCheckpoint = params.checkpointInput

    if (
      params.batch.finished &&
      params.nextMaxUpdated !== undefined &&
      Date.parse(params.nextMaxUpdated) > Date.parse(params.checkpointInput)
    )
      responseCheckpoint = params.nextMaxUpdated

    return {
      kind: 'changes',
      scope: params.scope,
      checkpoint: responseCheckpoint,
      deletedIds: [],
      coverage: params.coverage,
      coverageReason: params.coverageReason,
      batch: params.batch,
      continuation: params.continuation,
      metrics: params.metrics,
    }
  }

  let snapshotCheckpoint: string | undefined

  if (
    params.batch.finished &&
    params.manifest.extraction.modes.includes('changes') &&
    params.nextMaxUpdated !== undefined
  )
    snapshotCheckpoint = params.nextMaxUpdated

  return {
    kind: 'snapshot',
    scope: params.scope,
    coverage: params.coverage,
    coverageReason: params.coverageReason,
    checkpoint: snapshotCheckpoint,
    batch: params.batch,
    continuation: params.continuation,
    metrics: params.metrics,
  }
}

function selectionKey(
  input: AnalyticsDatasetQueryInput,
  kind: 'snapshot' | 'changes',
  batchSize: number,
  checkpoint: string | undefined,
): string {
  let filters: Array<[string, AnalyticsFilterValue]> = []
  if (input.filters !== undefined)
    filters = Object.entries(input.filters).sort(([left], [right]) =>
      left.localeCompare(right),
    )
  const canonicalFilters = filters.map(([name, value]) => {
    if (typeof value === 'object' && !Array.isArray(value))
      return [name, { from: value.from, to: value.to }]
    return [name, value]
  })
  return JSON.stringify([
    input.datasetId,
    input.projectId,
    input.startDate,
    input.endDate,
    canonicalFilters,
    kind,
    batchSize,
    checkpoint,
  ])
}
