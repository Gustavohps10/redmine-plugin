import { AnalyticsColumnSchema, AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { issueRow } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchIssuesPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const response = await client.listIssues({
    status_id: '*',
    sort: 'id:asc',
    ...params,
  })
  if (response.isFailure()) return response.forwardFailure()
  const columns = new Map<string, AnalyticsColumnSchema>()
  const data = response.success
  return Either.success({
    rows: data.issues.map((issue) => issueRow(issue, columns)),
    columns: Array.from(columns.values()),
    total: data.total_count,
    offset: data.offset,
    limit: data.limit,
    atomic: false,
  })
}
