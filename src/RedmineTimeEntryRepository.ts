import { ITimeEntryRepository, TimeEntry } from '@metric-org/sdk'

import { RedmineBase } from './RedmineBase'

export class RedmineTimeEntryRepository
  extends RedmineBase
  implements ITimeEntryRepository
{
  private hydrateTimeEntry(data: any): TimeEntry {
    return TimeEntry.hydrate({
      id: data.id,
      task: { id: data.issue.id },
      activity: { id: data.activity.id },
      user: { id: data.user.id, name: data.user.name },
      startDate: data.spentOn ? new Date(data.spentOn) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      timeSpent: data.hours,
      comments: data.comments,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    })
  }

  public async create(entity: TimeEntry): Promise<void> {
    const client = this.getHttpClient()
    if (!entity.id) return
    const response = await client.post('/time_entries.json', {
      time_entry: {
        project_id: entity.task.id,
        issue_id: entity.task.id,
        user_id: entity.user.id,
        activity_id: entity.activity.id,
        hours: entity.timeSpent,
        comments: entity.comments,
        spent_on: entity.startDate?.toISOString().split('T')[0],
      },
    })
    if (response.isFailure()) {
      throw new Error(response.failure.messageKey)
    }
  }

  public async update(entity: TimeEntry): Promise<void> {
    const client = this.getHttpClient()
    if (!entity.id) return
    const response = await client.put(`/time_entries/${entity.id}.json`, {
      time_entry: {
        project_id: entity.task.id,
        issue_id: entity.task.id,
        user_id: entity.user.id,
        activity_id: entity.activity.id,
        hours: entity.timeSpent,
        comments: entity.comments,
        spent_on: entity.startDate?.toISOString().split('T')[0],
      },
    })
    if (response.isFailure()) {
      throw new Error(response.failure.messageKey)
    }
  }

  public async delete(id?: string): Promise<void> {
    if (!id) return
    const client = this.getHttpClient()
    const response = await client.delete(`/time_entries/${id}.json`)
    if (response.isFailure()) {
      throw new Error(response.failure.messageKey)
    }
  }

  public async findById(id?: string): Promise<TimeEntry | undefined> {
    if (!id) return undefined
    const client = this.getHttpClient()
    const response = await client.get<any>(`/time_entries/${id}.json`)
    if (response.isFailure()) return undefined

    const entry = response.success?.time_entry
    if (!entry) return undefined

    return this.hydrateTimeEntry({
      id: entry.id,
      issue: { id: entry.issue.id },
      activity: { id: entry.activity.id, name: entry.activity.name },
      user: { id: entry.user.id, name: entry.user.name },
      hours: entry.hours,
      comments: entry.comments,
      spentOn: entry.spent_on,
      createdAt: entry.created_on,
      updatedAt: entry.updated_on,
    })
  }
}
