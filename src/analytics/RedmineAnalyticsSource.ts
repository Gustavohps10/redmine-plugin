import {
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsFilterDynamicSource,
  AnalyticsFilterOption,
  AnalyticsProviderContext,
  AppError,
  Either,
  IAnalyticsProvider,
  IAnalyticsSource,
} from '@mr-tick/sdk'

import { RedmineClient } from '../client/RedmineClient'
import { BoundedAnalyticsHttpClient } from './BoundedAnalyticsHttpClient'
import { fetchRedmineAnalyticsPage } from './index'
import { REDMINE_ANALYTICS_DATASETS } from './manifest'
import { RedmineAnalyticsPaging } from './paging'

export class RedmineAnalyticsProvider implements IAnalyticsProvider {
  private readonly paging = new RedmineAnalyticsPaging()
  constructor(private readonly client: RedmineClient) {}

  public async listAnalyticsDatasets(): Promise<
    Either<AppError, AnalyticsDatasetManifest[]>
  > {
    return Either.success(REDMINE_ANALYTICS_DATASETS)
  }

  public async fetchAnalyticsDataset(
    input: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    const manifest = REDMINE_ANALYTICS_DATASETS.find(
      (dataset) => dataset.id === input.datasetId,
    )
    if (manifest === undefined)
      return Either.failure(AppError.NotFound('ANALYTICS_DATASET_NOT_FOUND'))
    return this.paging.fetch(manifest, input, (offset, limit) =>
      fetchRedmineAnalyticsPage(this.client, input, offset, limit),
    )
  }

  public async getFilterOptions(
    source: AnalyticsFilterDynamicSource,
  ): Promise<Either<AppError, AnalyticsFilterOption[]>> {
    const datasets: Record<AnalyticsFilterDynamicSource, string> = {
      projects: 'redmine_projects',
      members: 'redmine_users',
      activities: 'redmine_activities',
      task_statuses: 'redmine_issue_statuses',
      task_priorities: 'redmine_priorities',
      task_trackers: 'redmine_trackers',
      sprints_versions: 'redmine_versions',
    }
    const datasetId = datasets[source]
    const options: AnalyticsFilterOption[] = []
    let cursor: string | undefined

    for (let page = 0; page < 50; page += 1) {
      const result = await this.fetchAnalyticsDataset({
        datasetId,
        execution: { kind: 'snapshot', cursor, batchSize: 100 },
      })
      if (result.isFailure()) return result.forwardFailure()

      for (const row of result.success.rows) {
        if (typeof row.id !== 'number' || typeof row.name !== 'string')
          return Either.failure(
            AppError.ValidationError('ANALYTICS_FILTER_OPTION_INVALID'),
          )
        options.push({ value: String(row.id), label: row.name })
      }

      const execution = result.success.execution
      if (execution.kind !== 'snapshot')
        return Either.failure(
          AppError.ValidationError('ANALYTICS_FILTER_EXECUTION_INVALID'),
        )
      if (execution.continuation === undefined) return Either.success(options)
      cursor = execution.continuation.cursor
    }
    return Either.failure(
      AppError.ValidationError('ANALYTICS_FILTER_OPTIONS_LIMIT'),
    )
  }
}

export class RedmineAnalyticsSource implements IAnalyticsSource {
  public createInstance(context: AnalyticsProviderContext): IAnalyticsProvider {
    return new RedmineAnalyticsProvider(
      RedmineClient.fromContext({
        ...context,
        httpClient: BoundedAnalyticsHttpClient.create(context.httpClient),
      }),
    )
  }
}
