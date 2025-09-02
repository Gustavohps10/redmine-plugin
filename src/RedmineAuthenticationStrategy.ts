import {
  AppError,
  AuthenticationResult,
  Either,
  IAuthenticationStrategy,
  MemberDTO,
} from '@timelapse/connector-sdk'
import axios, { AxiosInstance } from 'axios'

export interface RedmineConfiguration {
  apiUrl: string
}

export interface RedmineCredentials {
  login?: string
  password?: string
  apiKey?: string
}

// Novo tipo que unifica a entrada
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

export class RedmineAuthenticationStrategy
  implements IAuthenticationStrategy<RedmineAuthInput>
{
  private getApiClient(apiUrl: string): AxiosInstance {
    return axios.create({ baseURL: apiUrl })
  }

  async authenticate(
    input: RedmineAuthInput,
  ): Promise<Either<AppError, AuthenticationResult>> {
    try {
      const { configuration, credentials } = input

      const apiClient = this.getApiClient(configuration.apiUrl)

      const authHeaders = credentials.apiKey
        ? { 'X-Redmine-API-Key': credentials.apiKey }
        : {
            Authorization: `Basic ${Buffer.from(
              `${credentials.login}:${credentials.password}`,
            ).toString('base64')}`,
          }

      const response = await apiClient.get<RedmineUserResponse>(
        '/users/current.json',
        {
          headers: authHeaders,
        },
      )

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

      const authenticationResult: AuthenticationResult = {
        member: member,
        credentials: {
          apiKey: member.api_key,
        },
      }

      return Either.success(authenticationResult)
    } catch {
      return Either.failure(
        new AppError(
          'Não foi possível autenticar com Redmine. Verifique suas credenciais e a URL.',
          '',
          401,
        ),
      )
    }
  }
}
