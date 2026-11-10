import { AnalyticsDatasetQueryInput, AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../client/RedmineClient'
import { fetchCategoriesPage } from './datasets/categories.dataset'
import { fetchDictionaryPage } from './datasets/dictionaries.dataset'
import { fetchDiscoveryPage } from './datasets/discovery.dataset'
import { fetchIssuesPage } from './datasets/issues.dataset'
import { fetchJournalsPage } from './datasets/journals.dataset'
import { fetchMembershipsPage } from './datasets/memberships.dataset'
import { fetchProjectsPage } from './datasets/projects.dataset'
import { fetchQueriesPage } from './datasets/queries.dataset'
import { fetchRelationsPage } from './datasets/relations.dataset'
import { fetchTimeEntriesPage } from './datasets/time-entries.dataset'
import { fetchUsersPage } from './datasets/users.dataset'
import { fetchVersionsPage } from './datasets/versions.dataset'
import {
  redmineParams,
  resolveRedmineChangesUpdatedOn,
} from './helpers/filter-resolver'
import { RedmineAnalyticsPage } from './paging'

export async function fetchRedmineAnalyticsPage(
  client: RedmineClient,
  input: AnalyticsDatasetQueryInput,
  offset: number,
  limit: number,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  if (input.datasetId === 'redmine_issue_discovery')
    return fetchDiscoveryPage(client, input)

  let dateField: string | undefined
  let allowed: string[] = []

  switch (input.datasetId) {
    case 'redmine_time_entries':
      dateField = 'spent_on'
      allowed = ['project_id', 'user_id', 'activity_id']
      break
    case 'redmine_issues':
      dateField = 'created_on'
      allowed = ['project_id', 'assigned_to_id', 'status_id', 'tracker_id']
      break
    case 'redmine_memberships':
    case 'redmine_versions':
    case 'redmine_issue_categories':
      allowed = ['project_id']
      break
    case 'redmine_issue_journals':
    case 'redmine_issue_relations':
      allowed = ['issue_id']
      break
  }

  const filters = redmineParams(input, allowed, dateField)
  if (filters.isFailure()) return filters.forwardFailure()

  const resolvedParams = { ...filters.success }

  if (input.execution?.kind === 'changes') {
    if (input.datasetId !== 'redmine_issues')
      return Either.failure(
        AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
      )

    const intersection = resolveRedmineChangesUpdatedOn(
      input.execution.checkpoint,
      resolvedParams.updated_on,
    )
    if (intersection.isFailure()) return intersection.forwardFailure()

    if (intersection.success.emptyIntersection)
      return Either.success({
        rows: [],
        total: 0,
        offset: 0,
        limit,
        atomic: false,
      })

    resolvedParams.updated_on = intersection.success.updatedOn
  }

  const params = {
    ...resolvedParams,
    limit: String(limit),
    offset: String(offset),
  }

  switch (input.datasetId) {
    case 'redmine_time_entries':
      return fetchTimeEntriesPage(client, params)
    case 'redmine_issues':
      return fetchIssuesPage(client, params)
    case 'redmine_projects':
      return fetchProjectsPage(client, params)
    case 'redmine_users':
      return fetchUsersPage(client, params)
    case 'redmine_queries':
      return fetchQueriesPage(client, params)
    case 'redmine_memberships':
      return fetchMembershipsPage(client, params)
    case 'redmine_versions':
      return fetchVersionsPage(client, params)
    case 'redmine_issue_categories':
      return fetchCategoriesPage(client, params)
    case 'redmine_issue_journals':
      return fetchJournalsPage(client, params)
    case 'redmine_issue_relations':
      return fetchRelationsPage(client, params)
    default:
      return fetchDictionaryPage(client, input.datasetId)
  }
}

export { formatRedmineMultiValueParam } from './helpers/filter-resolver'
export { REDMINE_ANALYTICS_DATASETS } from './manifest'
