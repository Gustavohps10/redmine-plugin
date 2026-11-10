import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeId } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchVersionsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const project = requiredNativeId(params, 'project_id')
  if (project.isFailure()) return project.forwardFailure()
  const result = await client.listVersions(project.success)
  if (result.isFailure()) return result.forwardFailure()
  return Either.success({
    rows: result.success.versions.map((version) => ({
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
    })),
    atomic: true,
  })
}
