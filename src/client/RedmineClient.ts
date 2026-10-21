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
} from '../types/redmine'

export interface RedmineClientConfig {
  apiUrl: string
  apiKey: string
  atomKey?: string
  version?: string
}

export class RedmineClient {
  private readonly apiUrl: string
  private readonly apiKey: string
  private readonly atomKey: string
  private readonly version: string
  private readonly httpClient: IHttpClient

  constructor(
    httpClient: IHttpClient,
    config: RedmineClientConfig,
  ) {
    let apiUrl = ''
    if (config.apiUrl) {
      apiUrl = config.apiUrl.replace(/\/+$/, '')
    }
    this.apiUrl = apiUrl

    let apiKey = ''
    if (config.apiKey) {
      apiKey = config.apiKey.trim()
    }
    this.apiKey = apiKey

    let parsedAtomKey = ''
    if (config.atomKey) {
      parsedAtomKey = config.atomKey.trim()
      if (parsedAtomKey.includes('key=')) {
        const match = parsedAtomKey.match(/key=([a-zA-Z0-9]+)/)
        if (match) parsedAtomKey = match[1]
      }
    }
    this.atomKey = parsedAtomKey

    let version = 'auto'
    if (config.version) {
      version = config.version.trim()
    }
    this.version = version

    const headers: Record<string, string> = {}
    if (this.apiKey) {
      headers['X-Redmine-API-Key'] = this.apiKey
    }

    if (this.apiUrl) {
      this.httpClient = httpClient.withConfig({
        baseURL: this.apiUrl,
        headers,
      })
      return
    }

    this.httpClient = httpClient
  }

  public static fromContext(context: DataSourceContext): RedmineClient {
    let apiUrl = ''
    if (context.config && typeof context.config.apiUrl === 'string') {
      apiUrl = context.config.apiUrl
    }
    let apiKey = ''
    if (context.credentials && typeof context.credentials.apiKey === 'string') {
      apiKey = context.credentials.apiKey
    }
    let atomKey = ''
    if (context.credentials && typeof context.credentials.atomKey === 'string') {
      atomKey = context.credentials.atomKey
    }
    let version = 'auto'
    if (context.config && typeof context.config.redmineVersion === 'string') {
      version = context.config.redmineVersion
    }
    return new RedmineClient(context.httpClient, {
      apiUrl,
      apiKey,
      atomKey,
      version,
    })
  }

  public getApiUrl(): string {
    return this.apiUrl
  }

  public hasAtomFeed(): boolean {
    return this.atomKey.length > 0
  }

  public getVersion(): string {
    return this.version
  }

  private isHtmlLoginResponse(raw: string): boolean {
    const trimmed = raw.trimStart().toLowerCase()
    const isHtml = trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')
    if (isHtml) {
      return true
    }
    if (!trimmed.includes('<feed')) {
      return true
    }
    return false
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
    params?: Record<string, string>,
  ): Promise<Either<AppError, string>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()

    const requestParams: Record<string, string> = {}
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        requestParams[key] = value
      }
    }
    if (!requestParams['key'] && this.atomKey) {
      requestParams['key'] = this.atomKey
    }

    const atomRes = await this.httpClient.get<string>('activity.atom', {
      params: requestParams,
    })
    if (atomRes.isFailure()) return atomRes.forwardFailure()

    const raw = String(atomRes.success).trim()
    if (this.isHtmlLoginResponse(raw)) {
      return Either.failure(
        AppError.Unauthorized(
          'Acesso não autorizado ao feed Atom do Redmine. Verifique se a chave de API fornecida tem permissões para ler o feed.',
        ),
      )
    }

    return Either.success(raw)
  }

  public async validateAtomKey(
    atomKey?: string,
  ): Promise<Either<AppError, boolean>> {
    const validation = this.validateConfig()
    if (validation.isFailure()) return validation.forwardFailure()

    let keyToValidate = this.atomKey
    if (atomKey && atomKey.trim()) {
      keyToValidate = atomKey.trim()
    }

    if (!keyToValidate) {
      return Either.failure(
        AppError.ValidationError('Chave de acesso ao feed Atom obrigatória.'),
      )
    }

    let sanitizedKey = keyToValidate
    if (sanitizedKey.includes('key=')) {
      const match = sanitizedKey.match(/key=([a-zA-Z0-9]+)/)
      if (match) sanitizedKey = match[1]
    }

    if (sanitizedKey.length < 20 || !/^[a-zA-Z0-9_-]+$/.test(sanitizedKey)) {
      return Either.failure(
        AppError.ValidationError('Chave de acesso ao feed Atom inválida.'),
      )
    }

    const atomRes = await this.httpClient.get<string>('issues/changes.atom', {
      params: { key: sanitizedKey },
      headers: {
        Accept: 'application/atom+xml, application/xml, text/xml',
        'X-Redmine-API-Key': '',
      },
    })

    if (atomRes.isFailure()) {
      return Either.failure(
        AppError.ValidationError('Chave de acesso ao feed Atom inválida.'),
      )
    }

    const raw = String(atomRes.success).trim()
    if (this.isHtmlLoginResponse(raw) || !raw.includes(`key=${sanitizedKey}`)) {
      return Either.failure(
        AppError.ValidationError('Chave de acesso ao feed Atom inválida.'),
      )
    }

    return Either.success(true)
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
