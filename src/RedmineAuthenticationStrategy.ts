import {
  AppError,
  AuthenticationResult,
  Either,
  IAuthenticationStrategy,
  MemberDTO,
} from '@metric-org/sdk'
import axios, { AxiosInstance } from 'axios'

export interface RedmineConfiguration {
  apiUrl: string
}

export interface RedmineCredentials {
  apiKey: string
  atomKey: string
}

export interface RedmineAuthInput {
  configuration: RedmineConfiguration
  credentials: RedmineCredentials
}

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

export class RedmineAuthenticationStrategy implements IAuthenticationStrategy<RedmineAuthInput> {
  private getApiClient(apiUrl: string): AxiosInstance {
    return axios.create({ baseURL: apiUrl })
  }

  async authenticate(
    input: RedmineAuthInput,
  ): Promise<Either<AppError, AuthenticationResult>> {
    try {
      const { configuration, credentials } = input

      if (!credentials?.apiKey || !credentials?.atomKey) {
        return Either.failure(
          AppError.ValidationError(
            'Chave de Acesso à API e Chave de Acesso ao Atom são obrigatórias.',
          ),
        )
      }

      const apiClient = this.getApiClient(configuration.apiUrl)

      const response = await apiClient.get<RedmineUserResponse>(
        '/users/current.json',
        {
          headers: { 'X-Redmine-API-Key': credentials.apiKey },
        },
      )

      const redmineUser = response.data.user

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

      const authenticationResult: AuthenticationResult = {
        member: member,
        credentials: {
          apiKey: credentials.apiKey,
          atomKey: credentials.atomKey,
        },
      }

      return Either.success(authenticationResult)
    } catch {
      return Either.failure(
        AppError.Unauthorized(
          'Não foi possível autenticar com Redmine. Verifique suas chaves de acesso e a URL.',
        ),
      )
    }
  }
}
