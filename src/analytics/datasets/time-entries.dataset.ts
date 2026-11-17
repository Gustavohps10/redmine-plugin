import { AnalyticsColumnSchema, AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { timeEntryRow } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchTimeEntriesPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const response = await client.listTimeEntries(params)
  if (response.isFailure()) return response.forwardFailure()
  const columns = new Map<string, AnalyticsColumnSchema>()
  const data = response.success
  return Either.success({
    rows: data.time_entries.map((entry) => timeEntryRow(entry, columns)),
    columns: Array.from(columns.values()),
    total: data.total_count,
    offset: data.offset,
    limit: data.limit,
    atomic: false,
  })
}
