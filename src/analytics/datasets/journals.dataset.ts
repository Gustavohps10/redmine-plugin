import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeIds } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchJournalsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const issues = requiredNativeIds(params, 'issue_id')
  if (issues.isFailure()) return issues.forwardFailure()

  const rows: RedmineAnalyticsPage['rows'] = []

  for (const issueId of issues.success) {
    const result = await client.getIssueById(issueId, {
      include: 'journals',
    })
    if (result.isFailure()) return result.forwardFailure()

    const journals = result.success.issue.journals
    if (journals === undefined)
      return Either.failure(
        AppError.ValidationError('REDMINE_JOURNALS_NOT_RETURNED'),
      )

    for (const journal of journals) {
      rows.push({
        id: journal.id,
        issue_id: result.success.issue.id,
        user_id: nullable(journal.user?.id),
        user: nullable(journal.user?.name),
        notes: nullable(journal.notes),
        created_date: journal.created_on,
        details: nullable(JSON.stringify(journal.details)),
      })
    }
  }

  return Either.success({
    rows,
    atomic: true,
  })
}
