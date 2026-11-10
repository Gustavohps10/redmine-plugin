import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeId } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchJournalsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const issue = requiredNativeId(params, 'issue_id')
  if (issue.isFailure()) return issue.forwardFailure()
  const result = await client.getIssueById(issue.success, {
    include: 'journals',
  })
  if (result.isFailure()) return result.forwardFailure()
  const journals = result.success.issue.journals
  if (journals === undefined)
    return Either.failure(
      AppError.ValidationError('REDMINE_JOURNALS_NOT_RETURNED'),
    )
  return Either.success({
    rows: journals.map((journal) => ({
      id: journal.id,
      issue_id: result.success.issue.id,
      user_id: nullable(journal.user?.id),
      user: nullable(journal.user?.name),
      notes: nullable(journal.notes),
      created_date: journal.created_on,
      details: nullable(JSON.stringify(journal.details)),
    })),
    atomic: true,
  })
}
