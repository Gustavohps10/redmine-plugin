import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeIds } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchRelationsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const issues = requiredNativeIds(params, 'issue_id')
  if (issues.isFailure()) return issues.forwardFailure()

  const rows: RedmineAnalyticsPage['rows'] = []
  const seenIds = new Set<number>()

  for (const issueId of issues.success) {
    const result = await client.listIssueRelations(issueId)
    if (result.isFailure()) return result.forwardFailure()

    for (const relation of result.success.relations) {
      if (seenIds.has(relation.id)) continue
      seenIds.add(relation.id)

      rows.push({
        id: relation.id,
        issue_id: relation.issue_id,
        issue_to_id: relation.issue_to_id,
        relation_type: relation.relation_type,
        delay: nullable(relation.delay),
      })
    }
  }

  return Either.success({
    rows,
    atomic: true,
  })
}
