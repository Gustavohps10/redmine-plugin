import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchQueriesPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const result = await client.listQueries(params)
  if (result.isFailure()) return result.forwardFailure()
  const data = result.success
  return Either.success({
    rows: data.queries.map((query) => ({
      id: query.id,
      name: query.name,
      is_public: query.is_public,
      project_id: nullable(query.project_id),
    })),
    total: data.total_count,
    offset: data.offset,
    limit: data.limit,
    atomic: false,
  })
}
