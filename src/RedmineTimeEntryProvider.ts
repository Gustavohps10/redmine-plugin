import {
  AppError,
  CreatedTimeEntryResult,
  Either,
  ITimeEntryProvider,
  PagedResultDTO,
  PaginationOptionsDTO,
  TimeEntryDTO,
  UpdatedTimeEntryResult,
} from '@mr-tick/sdk'

import { RedmineClient } from './RedmineClient.js'
import {
  RedmineCreateTimeEntryPayload,
  RedmineTimeEntryAPI,
  RedmineUpdateTimeEntryPayload,
} from './types/redmine.js'

export class RedmineTimeEntryProvider implements ITimeEntryProvider {
  constructor(private readonly client: RedmineClient) {}

  public async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TimeEntryDTO[]>> {
    const newEntriesFound: TimeEntryDTO[] = []
    let offset = 0
    const limitPerPage = 100

    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setMonth(toDate.getMonth() - 2)

    const checkpointDate = checkpoint.updatedAt
    const hasValidCheckpoint =
      checkpointDate &&
      !isNaN(checkpointDate.getTime()) &&
      checkpointDate.getTime() > 0

    while (true) {
      const params: Record<string, string> = {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
        limit: String(limitPerPage),
        offset: String(offset),
      }

      if (memberId) params.user_id = memberId

      const result = await this.client.listTimeEntries(params)
      if (result.isFailure()) return result.forwardFailure()

      const entriesFromApi = result.success.time_entries
      if (entriesFromApi.length === 0) break

      const mappedEntries = entriesFromApi.map(
        (entry: RedmineTimeEntryAPI) => this.mapTimeEntryToDTO(entry),
      )

      const pageFiltered = mappedEntries.filter((entry: TimeEntryDTO) => {
        if (!hasValidCheckpoint) return true
        const updatedTime = entry.updatedAt.getTime()
        const checkpointTime = checkpointDate.getTime()
        if (updatedTime === checkpointTime) {
          return Number(entry.id) > Number(checkpoint.id)
        }
        return updatedTime > checkpointTime
      })

      if (pageFiltered.length > 0) newEntriesFound.push(...pageFiltered)
      if (newEntriesFound.length >= batch) break
      if (entriesFromApi.length < limitPerPage) break

      offset += limitPerPage
    }

    newEntriesFound.sort((a, b) => {
      const timeDiff = a.updatedAt.getTime() - b.updatedAt.getTime()
      if (timeDiff !== 0) return timeDiff
      return Number(a.id) - Number(b.id)
    })

    return Either.success(newEntriesFound.slice(0, batch))
  }

  public async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    const params: Record<string, string> = {
      user_id: memberId,
      from: startDate.toISOString().split('T')[0],
      to: endDate.toISOString().split('T')[0],
      limit: '100',
    }

    const result = await this.client.listTimeEntries(params)
    if (result.isFailure()) return result.forwardFailure()

    const items = result.success.time_entries.map(
      (entry: RedmineTimeEntryAPI) => this.mapTimeEntryToDTO(entry),
    )

    return Either.success({
      items,
      total: result.success.total_count,
      page: 1,
      pageSize: items.length,
    })
  }

  public async findById(
    id: string,
  ): Promise<Either<AppError, TimeEntryDTO | null>> {
    const result = await this.client.getTimeEntryById(id)
    if (result.isFailure()) {
      if (result.failure.statusCode === 404) return Either.success(null)
      return result.forwardFailure()
    }

    const dto = this.mapTimeEntryToDTO(result.success.time_entry)
    return Either.success(dto)
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    const page = pagination?.page ? pagination.page : 1
    const pageSize = pagination?.pageSize ? pagination.pageSize : 25
    const offset = (page - 1) * pageSize

    const params: Record<string, string> = {
      limit: String(pageSize),
      offset: String(offset),
    }

    const result = await this.client.listTimeEntries(params)
    if (result.isFailure()) return result.forwardFailure()

    const items = result.success.time_entries.map(
      (entry: RedmineTimeEntryAPI) => this.mapTimeEntryToDTO(entry),
    )

    return Either.success({
      items,
      total: result.success.total_count,
      page,
      pageSize,
    })
  }

  public async create(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, CreatedTimeEntryResult>> {
    const spentOn = entry.startDate
      ? entry.startDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

    const payload: RedmineCreateTimeEntryPayload = {
      time_entry: {
        issue_id: Number(entry.task.id),
        activity_id: Number(entry.activity.id),
        hours: entry.timeSpent,
        comments: entry.comments,
        spent_on: spentOn,
      },
    }

    if (entry.user && entry.user.id) {
      payload.time_entry.user_id = Number(entry.user.id)
    }

    const result = await this.client.createTimeEntry(payload)
    if (result.isFailure()) return result.forwardFailure()

    return Either.success({
      id: String(result.success.time_entry.id),
      updatedAt: new Date(result.success.time_entry.updated_on),
    })
  }

  public async update(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>> {
    if (!entry.id)
      return Either.failure(
        AppError.ValidationError(
          'ID do apontamento obrigatório para atualização',
        ),
      )

    const payload: RedmineUpdateTimeEntryPayload = {
      time_entry: {
        issue_id: entry.task?.id ? Number(entry.task.id) : undefined,
        activity_id: entry.activity?.id
          ? Number(entry.activity.id)
          : undefined,
        hours: entry.timeSpent,
        comments: entry.comments,
        spent_on: entry.startDate
          ? entry.startDate.toISOString().split('T')[0]
          : undefined,
      },
    }

    const result = await this.client.updateTimeEntry(entry.id, payload)
    if (result.isFailure()) return result.forwardFailure()

    return Either.success({
      id: entry.id,
      updatedAt: new Date(),
    })
  }

  public async delete(id: string): Promise<Either<AppError, void>> {
    const result = await this.client.deleteTimeEntry(id)
    if (result.isFailure()) return result.forwardFailure()
    return Either.success(undefined)
  }

  private mapTimeEntryToDTO(entry: RedmineTimeEntryAPI): TimeEntryDTO {
    const hours = Number(entry.hours) || 0
    const spentOnUTC = new Date(entry.spent_on + 'T00:00:00Z')
    const createdOnUTC = new Date(entry.created_on)

    const endDate = new Date(spentOnUTC)
    endDate.setUTCHours(
      createdOnUTC.getUTCHours(),
      createdOnUTC.getUTCMinutes(),
      createdOnUTC.getUTCSeconds(),
      0,
    )

    const startDate = new Date(spentOnUTC)
    const startMs = endDate.getTime() - hours * 60 * 60 * 1000
    const startTemp = new Date(startMs)

    startDate.setUTCHours(
      startTemp.getUTCHours(),
      startTemp.getUTCMinutes(),
      startTemp.getUTCSeconds(),
      0,
    )

    const taskId = entry.issue
      ? String(entry.issue.id)
      : String(entry.project.id)

    return {
      id: String(entry.id),
      task: { id: taskId },
      activity: {
        id: String(entry.activity.id),
        name: entry.activity.name,
      },
      user: {
        id: String(entry.user.id),
        name: entry.user.name,
      },
      startDate,
      endDate,
      timeSpent: hours,
      comments: entry.comments,
      createdAt: new Date(entry.created_on),
      updatedAt: new Date(entry.updated_on),
      source: 'addon',
    }
  }
}
