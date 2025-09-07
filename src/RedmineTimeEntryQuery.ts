import {
  ITimeEntryQuery,
  PagedResultDTO,
  PaginationOptionsDTO,
  TimeEntryDTO,
} from '@timelapse/sdk'

import { RedmineBase } from './RedmineBase'

export class RedmineTimeEntryQuery
  extends RedmineBase
  implements ITimeEntryQuery
{
  public async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PagedResultDTO<TimeEntryDTO>> {
    const client = await this.getAuthenticatedClient()

    const response = await client.get('/time_entries.json', {
      params: {
        user_id: memberId,
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        limit: 100,
      },
    })

    const entries: TimeEntryDTO[] = response.data.time_entries.map(
      (entry: any) => ({
        id: entry.id,
        project: { id: entry.project.id, name: entry.project.name },
        issue: { id: entry.issue?.id },
        user: { id: entry.user.id, name: entry.user.name },
        activity: { id: entry.activity.id, name: entry.activity.name },
        hours: entry.hours,
        comments: entry.comments,
        spentOn: new Date(entry.spent_on),
        createdAt: new Date(entry.created_on),
        updatedAt: new Date(entry.updated_on),
      }),
    )

    return {
      items: entries,
      total: response.data.total_count ?? entries.length,
      page: 1,
      pageSize: entries.length,
    }
  }

  findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<TimeEntryDTO>> {
    throw new Error(
      'Método "findAll" não implementado para o conector Redmine.',
    )
  }

  findById(id: string): Promise<TimeEntryDTO | undefined> {
    throw new Error(
      'Método "findById" não implementado para o conector Redmine.',
    )
  }

  findByIds(ids: string[]): Promise<TimeEntryDTO[]> {
    throw new Error(
      'Método "findByIds" não implementado para o conector Redmine.',
    )
  }

  findByCondition(
    condition: Partial<TimeEntryDTO>,
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<TimeEntryDTO>> {
    throw new Error(
      'Método "findByCondition" não implementado para o conector Redmine.',
    )
  }

  count(criteria?: Partial<TimeEntryDTO>): Promise<number> {
    throw new Error('Método "count" não implementado para o conector Redmine.')
  }

  exists(criteria: Partial<TimeEntryDTO>): Promise<boolean> {
    throw new Error('Método "exists" não implementado para o conector Redmine.')
  }
}
