import {
  AppError,
  Either,
  IMemberProvider,
  MemberDTO,
  PagedResultDTO,
  PaginationOptionsDTO,
} from '@mr-tick/sdk'

import { RedmineClient } from './RedmineClient.js'
import { RedmineUserAPI } from './types/redmine.js'

export class RedmineMemberProvider implements IMemberProvider {
  constructor(private readonly client: RedmineClient) {}

  public async getCurrentUser(): Promise<Either<AppError, MemberDTO | null>> {
    const userResult = await this.client.getCurrentUser()
    if (userResult.isFailure()) {
      if (userResult.failure.statusCode === 404) return Either.success(null)
      return userResult.forwardFailure()
    }

    const member = this.mapUserToDTO(userResult.success.user)
    return Either.success(member)
  }

  public async findById(id: string): Promise<Either<AppError, MemberDTO | null>> {
    const userResult = await this.client.getUserById(id)
    if (userResult.isFailure()) {
      if (userResult.failure.statusCode === 404) return Either.success(null)
      return userResult.forwardFailure()
    }

    const member = this.mapUserToDTO(userResult.success.user)
    return Either.success(member)
  }

  public async findByCredentials(
    login: string,
    password: string,
  ): Promise<Either<AppError, MemberDTO>> {
    return Either.failure(
      AppError.ValidationError(
        'Autenticação por login e senha não suportada diretamente pelo Redmine. Utilize a chave de API.',
      ),
    )
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<MemberDTO>>> {
    const currentResult = await this.getCurrentUser()
    if (currentResult.isFailure()) return currentResult.forwardFailure()

    const member = currentResult.success
    const items = member ? [member] : []

    return Either.success({
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    })
  }

  private mapUserToDTO(user: RedmineUserAPI): MemberDTO {
    return {
      id: user.id,
      login: user.login,
      firstname: user.firstname,
      lastname: user.lastname,
      admin: Boolean(user.admin),
      createdOn: user.created_on,
      lastLoginOn: user.last_login_on
        ? user.last_login_on
        : user.created_on,
      customFields: user.custom_fields ? user.custom_fields : [],
    }
  }
}
