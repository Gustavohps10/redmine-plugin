import {
  AppError,
  AuthenticationResult,
  Either,
  IAuthenticationStrategy,
  MemberDTO,
} from '@mr-tick/sdk'

import { RedmineClient } from './RedmineClient.js'

export interface RedmineAuthCredentials {
  apiKey: string
  atomKey?: string
}

export interface RedmineAuthConfiguration {
  apiUrl: string
}

export interface RedmineAuthInput {
  configuration?: RedmineAuthConfiguration
  credentials?: RedmineAuthCredentials
}

export class RedmineAuthenticationStrategy
  implements IAuthenticationStrategy<RedmineAuthInput>
{
  constructor(private readonly client: RedmineClient) {}

  async authenticate(
    input?: RedmineAuthInput,
  ): Promise<Either<AppError, AuthenticationResult>> {
    const userResult = await this.client.getCurrentUser()
    if (userResult.isFailure()) return userResult.forwardFailure()

    const redmineUser = userResult.success.user

    const member: MemberDTO = {
      id: redmineUser.id,
      login: redmineUser.login,
      firstname: redmineUser.firstname,
      lastname: redmineUser.lastname,
      admin: Boolean(redmineUser.admin),
      createdOn: redmineUser.created_on,
      lastLoginOn: redmineUser.last_login_on
        ? redmineUser.last_login_on
        : redmineUser.created_on,
      customFields: redmineUser.custom_fields
        ? redmineUser.custom_fields
        : [],
    }

    const credentialsRecord: Record<string, string> = {}
    const apiKey = input?.credentials?.apiKey
    if (apiKey) credentialsRecord.apiKey = apiKey
    const atomKey = input?.credentials?.atomKey
    if (atomKey) credentialsRecord.atomKey = atomKey

    return Either.success({
      member,
      credentials: credentialsRecord,
    })
  }
}
