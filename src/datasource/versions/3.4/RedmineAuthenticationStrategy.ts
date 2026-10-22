import { AppError, AuthenticationResult, Either } from '@mr-tick/sdk'

import { RedmineClient } from '../../../client/RedmineClient'

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

export type RedmineAuthorizedResult = Extract<
  AuthenticationResult,
  { kind: 'authorized' }
>

export class RedmineAuthenticationStrategy {
  constructor(private readonly client: RedmineClient) {}

  async authenticate(
    input?: RedmineAuthInput,
  ): Promise<Either<AppError, RedmineAuthorizedResult>> {
    const userResult = await this.client.getCurrentUser()
    if (userResult.isFailure()) return userResult.forwardFailure()

    let rawAtomKey = ''
    if (input?.credentials?.atomKey) {
      rawAtomKey = input.credentials.atomKey
    }

    if (!rawAtomKey || !rawAtomKey.trim()) {
      return Either.failure(
        AppError.ValidationError('Chave de acesso ao feed Atom obrigatória.'),
      )
    }

    const atomValidation = await this.client.validateAtomKey(rawAtomKey)
    if (atomValidation.isFailure()) return atomValidation.forwardFailure()

    const redmineUser = userResult.success.user

    const credentialsRecord: Record<string, string> = {}
    const apiKey = input?.credentials?.apiKey
    if (apiKey) credentialsRecord.apiKey = apiKey
    const atomKey = input?.credentials?.atomKey
    if (atomKey) credentialsRecord.atomKey = atomKey

    let tenantId = ''
    if (input?.configuration?.apiUrl) {
      tenantId = input.configuration.apiUrl
    }

    const identity: RedmineAuthorizedResult['identity'] = {
      kind: 'human',
      providerId: 'redmine',
      tenantId,
      providerSubjectId: String(redmineUser.id),
      displayName: `${redmineUser.firstname} ${redmineUser.lastname}`.trim(),
    }

    return Either.success({
      kind: 'authorized',
      identity,
      credentials: credentialsRecord,
    })
  }
}
