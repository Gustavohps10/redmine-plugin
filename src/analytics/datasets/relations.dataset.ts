import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeId } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchRelationsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const issue = requiredNativeId(params, 'issue_id')
  if (issue.isFailure()) return issue.forwardFailure()
  const result = await client.listIssueRelations(issue.success)
  if (result.isFailure()) return result.forwardFailure()
  return Either.success({
    rows: result.success.relations.map((relation) => ({
      id: relation.id,
      issue_id: relation.issue_id,
      issue_to_id: relation.issue_to_id,
      relation_type: relation.relation_type,
      delay: nullable(relation.delay),
    })),
    atomic: true,
  })
}
