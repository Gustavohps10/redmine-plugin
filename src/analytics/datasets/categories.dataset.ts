import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeIds } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchCategoriesPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const projects = requiredNativeIds(params, 'project_id')
  if (projects.isFailure()) return projects.forwardFailure()

  const rows: RedmineAnalyticsPage['rows'] = []

  for (const projectId of projects.success) {
    const result = await client.listIssueCategories(projectId)
    if (result.isFailure()) return result.forwardFailure()

    for (const category of result.success.issue_categories) {
      rows.push({
        id: category.id,
        project_id: nullable(category.project?.id),
        project: nullable(category.project?.name),
        name: category.name,
        assignee_id: nullable(category.assigned_to?.id),
        assignee: nullable(category.assigned_to?.name),
      })
    }
  }

  return Either.success({
    rows,
    atomic: true,
  })
}
