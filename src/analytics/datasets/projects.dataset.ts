import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchProjectsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const result = await client.listProjects(params)
  if (result.isFailure()) return result.forwardFailure()
  const data = result.success
  return Either.success({
    rows: data.projects.map((project) => ({
      id: project.id,
      name: project.name,
      identifier: project.identifier,
      description: nullable(project.description),
      status: project.status,
      is_public: nullable(project.is_public),
      created_date: project.created_on,
      updated_date: project.updated_on,
    })),
    total: data.total_count,
    offset: data.offset,
    limit: data.limit,
    atomic: false,
  })
}
