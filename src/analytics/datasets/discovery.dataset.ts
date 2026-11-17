import {
  AnalyticsColumnSchema,
  AnalyticsDatasetQueryInput,
  AppError,
  Either,
} from '@mr-tick/sdk'

import { NativeAtomParser } from '../../client/NativeAtomParser'
import { RedmineClient } from '../../client/RedmineClient'
import { redmineParams } from '../helpers/filter-resolver'
import { issueRow } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

/** Activity Atom is a bounded discovery feed; it ignores historical window parameters. */
export async function fetchDiscoveryPage(
  client: RedmineClient,
  input: AnalyticsDatasetQueryInput,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  if (!client.hasAtomFeed())
    return Either.failure(AppError.ValidationError('REDMINE_ATOM_KEY_REQUIRED'))
  const filters = redmineParams(input, ['project_id'], 'updated_on')
  if (filters.isFailure()) return filters.forwardFailure()
  const params: Record<string, string> = { show_issues: '1' }
  if (filters.success.project_id !== undefined)
    params.project_id = filters.success.project_id
  const response = await client.getActivityAtom(params)
  if (response.isFailure()) return response.forwardFailure()
  const ids = new Set<string>()

  for (const entry of NativeAtomParser.parseEntries(response.success)) {
    const date = entry.updated.slice(0, 10)
    const range = filters.success.updated_on
    if (range !== undefined && !matchesRange(date, range)) continue
    const match = /(?:\/issues\/|Issue-)(\d+)/.exec(entry.id)
    if (match === null) continue
    const id = match.at(1)
    if (id === undefined) continue
    ids.add(id)
  }

  if (ids.size > 100)
    return Either.failure(
      AppError.ValidationError('REDMINE_ATOM_DISCOVERY_IDS_LIMIT'),
    )
  if (ids.size === 0)
    return Either.success({
      rows: [],
      atomic: true,
      unverifiedReason: 'REDMINE_ATOM_FEED_LIMITED',
    })
  const issues = await client.listIssues({
    issue_id: Array.from(ids).join(','),
    status_id: '*',
    limit: '100',
  })
  if (issues.isFailure()) return issues.forwardFailure()
  if (
    issues.success.issues.length !== ids.size ||
    issues.success.issues.some((issue) => !ids.has(String(issue.id)))
  )
    return Either.failure(
      AppError.ValidationError('REDMINE_DISCOVERY_IDS_UNAVAILABLE'),
    )
  const columns = new Map<string, AnalyticsColumnSchema>()
  return Either.success({
    rows: issues.success.issues.map((issue) => issueRow(issue, columns)),
    columns: Array.from(columns.values()),
    atomic: true,
    unverifiedReason: 'REDMINE_ATOM_FEED_LIMITED',
  })
}

function matchesRange(date: string, range: string): boolean {
  if (range.startsWith('>=')) return date >= range.slice(2)
  if (range.startsWith('<=')) return date <= range.slice(2)
  const [start, end] = range.slice(2).split('|')
  if (start === undefined || end === undefined) return false
  return date >= start && date <= end
}
