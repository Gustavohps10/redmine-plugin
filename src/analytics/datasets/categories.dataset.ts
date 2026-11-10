import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeId } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchCategoriesPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const project = requiredNativeId(params, 'project_id')
  if (project.isFailure()) return project.forwardFailure()
  const result = await client.listIssueCategories(project.success)
  if (result.isFailure()) return result.forwardFailure()
  return Either.success({
    rows: result.success.issue_categories.map((category) => ({
      id: category.id,
      project_id: nullable(category.project?.id),
      project: nullable(category.project?.name),
      name: category.name,
      assignee_id: nullable(category.assigned_to?.id),
      assignee: nullable(category.assigned_to?.name),
    })),
    atomic: true,
  })
}
