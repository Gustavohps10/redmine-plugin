import { AppError, DataSourceContext, Either, IHttpClient } from '@mr-tick/sdk'

import {
  RedmineActivitiesResponse,
  RedmineCreateTimeEntryPayload,
  RedmineIssueResponse,
  RedmineIssuesResponse,
  RedminePrioritiesResponse,
  RedmineStatusesResponse,
  RedmineTimeEntriesResponse,
  RedmineTimeEntryResponse,
  RedmineTrackersResponse,
  RedmineUpdateTimeEntryPayload,
  RedmineUserResponse,
} from './types/redmine.js'

export interface RedmineClientConfig {
  apiUrl: string
  apiKey: string
  atomKey?: string
}

export class RedmineClient {
  private readonly apiUrl: string
  private readonly apiKey: string
  private readonly atomKey: string

  constructor(
    private readonly httpClient: IHttpClient,
    config: RedmineClientConfig,
  ) {
    this.apiUrl = config.apiUrl ? config.apiUrl.replace(/\/+$/, '') : ''
    this.apiKey = config.apiKey ? config.apiKey.trim() : ''
    this.atomKey = config.atomKey ? config.atomKey.trim() : ''

    if (this.apiUrl) {
      this.httpClient.configure({
        baseURL: this.apiUrl,
        headers: this.apiKey ? { 'X-Redmine-API-Key': this.apiKey } : {},
      })
    }
  }

  public static fromContext(context: DataSourceContext): RedmineClient {
    const apiUrlValue = context.config ? context.config.apiUrl : ''
    const apiKeyValue = context.credentials ? context.credentials.apiKey : ''
    const atomKeyValue = context.credentials ? context.credentials.atomKey : ''
    const apiUrl = typeof apiUrlValue === 'string' ? apiUrlValue : ''
    const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue : ''
    const atomKey = typeof atomKeyValue === 'string' ? atomKeyValue : ''
    return new RedmineClient(context.httpClient, { apiUrl, apiKey, atomKey })
  }

  public getApiUrl(): string {
    return this.apiUrl
  }

  public getApiKey(): string {
    return this.apiKey
  }

  public getAtomKey(): string {
    return this.atomKey
  }

  private validateConfig(): Either<AppError, void> {
    if (!this.apiUrl)
      return Either.failure(
        AppError.ValidationError('URL da API do Redmine não configurada.'),
      )
    if (!this.apiKey)
      return Either.failure(
        AppError.ValidationError(
          'Chave de API (X-Redmine-API-Key) não configurada.',
        ),
      )
    return Either.success(undefined)
  }

  public async getCurrentUser(): Promise<Either<AppError, RedmineUserResponse>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineUserResponse>('/users/current.json')
  }

  public async getUserById(
    id: string,
  ): Promise<Either<AppError, RedmineUserResponse>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineUserResponse>(`/users/${id}.json`)
  }

  public async listIssues(
    params: Record<string, string>,
  ): Promise<Either<AppError, RedmineIssuesResponse>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineIssuesResponse>('/issues.json', {
      params,
    })
  }

  public async getIssueById(
    id: string,
  ): Promise<Either<AppError, RedmineIssueResponse>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineIssueResponse>(`/issues/${id}.json`)
  }

  public async getActivityAtom(
    params: Record<string, string>,
  ): Promise<Either<AppError, string>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<string>('activity.atom', {
      params,
    })
  }

  public async listTimeEntries(
    params: Record<string, string>,
  ): Promise<Either<AppError, RedmineTimeEntriesResponse>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineTimeEntriesResponse>(
      '/time_entries.json',
      { params },
    )
  }

  public async getTimeEntryById(
    id: string,
  ): Promise<Either<AppError, RedmineTimeEntryResponse>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineTimeEntryResponse>(
      `/time_entries/${id}.json`,
    )
  }

  public async createTimeEntry(
    payload: RedmineCreateTimeEntryPayload,
  ): Promise<Either<AppError, RedmineTimeEntryResponse>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.post<RedmineTimeEntryResponse>(
      '/time_entries.json',
      payload,
    )
  }

  public async updateTimeEntry(
    id: string,
    payload: RedmineUpdateTimeEntryPayload,
  ): Promise<Either<AppError, void>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.put<void>(`/time_entries/${id}.json`, payload)
  }

  public async deleteTimeEntry(id: string): Promise<Either<AppError, void>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.delete<void>(`/time_entries/${id}.json`)
  }

  public async getActivities(): Promise<
    Either<AppError, RedmineActivitiesResponse>
  > {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineActivitiesResponse>(
      '/enumerations/time_entry_activities.json',
    )
  }

  public async getIssueStatuses(): Promise<
    Either<AppError, RedmineStatusesResponse>
  > {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineStatusesResponse>(
      '/issue_statuses.json',
    )
  }

  public async getPriorities(): Promise<
    Either<AppError, RedminePrioritiesResponse>
  > {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedminePrioritiesResponse>(
      '/enumerations/issue_priorities.json',
    )
  }

  public async getTrackers(): Promise<
    Either<AppError, RedmineTrackersResponse>
  > {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()
    return this.httpClient.get<RedmineTrackersResponse>('/trackers.json')
  }
}
