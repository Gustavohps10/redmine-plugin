import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeIds } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchVersionsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const projects = requiredNativeIds(params, 'project_id')
  if (projects.isFailure()) return projects.forwardFailure()

  const rows: RedmineAnalyticsPage['rows'] = []

  for (const projectId of projects.success) {
    const result = await client.listVersions(projectId)
    if (result.isFailure()) return result.forwardFailure()

    for (const version of result.success.versions) {
      rows.push({
        id: version.id,
        project_id: version.project.id,
        project: version.project.name,
        name: version.name,
        description: nullable(version.description),
        status: version.status,
        due_date: nullable(version.due_date),
        sharing: nullable(version.sharing),
        created_date: version.created_on,
        updated_date: version.updated_on,
      })
    }
  }

  return Either.success({
    rows,
    atomic: true,
  })
}
