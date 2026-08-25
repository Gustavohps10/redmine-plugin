import {
  DataSourceContext,
  IMemberQuery,
  MemberDTO,
  PagedResultDTO,
  PaginationOptionsDTO,
} from '@metric-org/sdk'

import { RedmineBase } from '@/RedmineBase'

interface RedmineUserAPIResponse {
  id: number
  login: string
  admin: boolean
  firstname: string
  lastname: string
  mail: string
  created_on: string
  last_login_on: string
  api_key: string
  custom_fields: {
    id: number
    name: string
    value: string
  }[]
}

interface RedmineUserResponse {
  user: RedmineUserAPIResponse
}

export class RedmineMemberQuery extends RedmineBase implements IMemberQuery {
  constructor(context: DataSourceContext) {
    super(context)
  }
  findByCredentials(login: string, password: string): Promise<MemberDTO> {
    throw new Error('Method not implemented.')
  }

  findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<MemberDTO>> {
    throw new Error(
      'Método "findAll" não implementado para o conector Redmine.',
    )
  }

  findByIds(ids: string[]): Promise<MemberDTO[]> {
    throw new Error(
      'Método "findByIds" não implementado para o conector Redmine.',
    )
  }

  findByCondition(
    condition: Partial<MemberDTO>,
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<MemberDTO>> {
    throw new Error(
      'Método "findByCondition" não implementado para o conector Redmine.',
    )
  }

  count(criteria?: Partial<MemberDTO>): Promise<number> {
    throw new Error('Método "count" não implementado para o conector Redmine.')
  }

  exists(criteria: Partial<MemberDTO>): Promise<boolean> {
    throw new Error('Método "exists" não implementado para o conector Redmine.')
  }

  public async findById(id: string): Promise<MemberDTO> {
    const client = this.getHttpClient()
    const response = await client.get<RedmineUserResponse>(`/users/${id}.json`)
    if (response.isFailure()) throw new Error(response.failure.messageKey)

    const redmineUser = response.success.user

    const member: MemberDTO = {
      id: redmineUser.id,
      login: redmineUser.login,
      firstname: redmineUser.firstname,
      lastname: redmineUser.lastname,
      admin: redmineUser.admin,
      createdOn: redmineUser.created_on,
      lastLoginOn: redmineUser.last_login_on,
      customFields: redmineUser.custom_fields,
    }

    return member
  }
}
