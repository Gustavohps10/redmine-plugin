import { AnalyticsColumnSchema, AppError, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../client/RedmineClient'
import { addCustomFields, nullable } from '../helpers/native-fields'
import { RedmineAnalyticsPage } from '../paging'

export async function fetchUsersPage(
  client: RedmineClient,
  params: Record<string, string>,
): Promise<Either<AppError, RedmineAnalyticsPage>> {
  const result = await client.listUsers(params)
  if (result.isFailure()) return result.forwardFailure()
  const data = result.success
  const columns = new Map<string, AnalyticsColumnSchema>()
  const rows = data.users.map((user) => {
    const row = {
      id: user.id,
      login: nullable(user.login),
      name: `${user.firstname} ${user.lastname}`.trim(),
      firstname: user.firstname,
      lastname: user.lastname,
      mail: nullable(user.mail),
      status: nullable(user.status),
      created_date: user.created_on,
      last_login_date: nullable(user.last_login_on),
    }
    addCustomFields(row, user.custom_fields, columns)
    return row
  })
  return Either.success({
    rows,
    columns: Array.from(columns.values()),
    total: data.total_count,
    offset: data.offset,
    limit: data.limit,
    atomic: false,
  })
}
