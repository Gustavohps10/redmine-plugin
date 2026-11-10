import { AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { requiredNativeId } from '../helpers/filter-resolver'
import { nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchMembershipsPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const project = requiredNativeId(params, 'project_id')
  if (project.isFailure()) return project.forwardFailure()
  const result = await client.listMemberships(project.success, {
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
