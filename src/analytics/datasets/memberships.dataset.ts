import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeIds } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchMembershipsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const projects = requiredNativeIds(params, 'project_id')
  if (projects.isFailure()) return projects.forwardFailure()

  if (projects.success.length === 1) {
    const [singleProjectId] = projects.success
    if (singleProjectId === undefined)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_PROJECT_ID_REQUIRED'),
      )

    const result = await client.listMemberships(singleProjectId, {
      limit: params.limit,
      offset: params.offset,
    })
    if (result.isFailure()) return result.forwardFailure()

    const data = result.success

    return Either.success({
      rows: data.memberships.map((member) => ({
        id: member.id,
        project_id: member.project.id,
        project: member.project.name,
        user_id: nullable(member.user?.id),
        user: nullable(member.user?.name),
        group_id: nullable(member.group?.id),
        group: nullable(member.group?.name),
        roles: JSON.stringify(member.roles),
      })),
      total: data.total_count,
      offset: data.offset,
      limit: data.limit,
      atomic: false,
    })
  }

  const rows: RedmineAnalyticsPage['rows'] = []

  for (const projectId of projects.success) {
    let offset = 0
    const pageLimit = 100

    for (let page = 0; page < 50; page += 1) {
      const result = await client.listMemberships(projectId, {
        limit: String(pageLimit),
        offset: String(offset),
      })
      if (result.isFailure()) return result.forwardFailure()

      const data = result.success

      for (const member of data.memberships) {
        rows.push({
          id: member.id,
          project_id: member.project.id,
          project: member.project.name,
          user_id: nullable(member.user?.id),
          user: nullable(member.user?.name),
          group_id: nullable(member.group?.id),
          group: nullable(member.group?.name),
          roles: JSON.stringify(member.roles),
        })
      }

      offset += data.memberships.length
      if (
        (data.total_count !== undefined && offset >= data.total_count) ||
        data.memberships.length < pageLimit
      )
        break
    }
  }

  return Either.success({
    rows,
    atomic: true,
  })
}
