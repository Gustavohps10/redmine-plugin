import {
  Context,
  IMemberQuery,
  MemberDTO,
  PagedResultDTO,
  PaginationOptionsDTO,
} from '@timelapse/sdk'

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
  constructor(context: Context) {
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
    const client = await this.getAuthenticatedClient()
    const response = await client.get<RedmineUserResponse>(`/users/${id}.json`)

    const redmineUser = response.data.user

    const member: MemberDTO = {
      id: redmineUser.id,
      login: redmineUser.login,
      firstname: redmineUser.firstname,
      lastname: redmineUser.lastname,
      admin: redmineUser.admin,
      created_on: redmineUser.created_on,
      last_login_on: redmineUser.last_login_on,
      api_key: redmineUser.api_key,
      custom_fields: redmineUser.custom_fields,
    }

    return member
  }
}
