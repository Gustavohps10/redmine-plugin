import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchDictionaryPage(
  client: RedmineClient,
  datasetId: string,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  switch (datasetId) {
    case 'redmine_issue_statuses': {
      const result = await client.getIssueStatuses()
      if (result.isFailure()) return result.forwardFailure()
      return Either.success({
        rows: result.success.issue_statuses.map((status) => ({
          id: status.id,
          name: status.name,
          is_closed: nullable(status.is_closed),
        })),
        atomic: true,
      })
    }
    case 'redmine_trackers': {
      const result = await client.getTrackers()
      if (result.isFailure()) return result.forwardFailure()
      return Either.success({
        rows: result.success.trackers.map((tracker) => ({
          id: tracker.id,
          name: tracker.name,
        })),
        atomic: true,
      })
    }
    case 'redmine_activities': {
      const result = await client.getActivities()
      if (result.isFailure()) return result.forwardFailure()
      return Either.success({
        rows: result.success.time_entry_activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          is_default: nullable(activity.is_default),
        })),
        atomic: true,
      })
    }
    case 'redmine_priorities': {
      const result = await client.getPriorities()
      if (result.isFailure()) return result.forwardFailure()
      return Either.success({
        rows: result.success.issue_priorities.map((priority) => ({
          id: priority.id,
          name: priority.name,
          is_default: nullable(priority.is_default),
        })),
        atomic: true,
      })
    }
    case 'redmine_groups': {
      const result = await client.listGroups()
      if (result.isFailure()) return result.forwardFailure()
      return Either.success({
        rows: result.success.groups.map((group) => ({
          id: group.id,
          name: group.name,
        })),
        atomic: true,
      })
    }
    default:
      return Either.failure(AppError.NotFound('ANALYTICS_DATASET_NOT_FOUND'))
  }
}
