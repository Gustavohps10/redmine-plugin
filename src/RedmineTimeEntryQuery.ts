import {
  ITimeEntryQuery,
  PagedResultDTO,
  PaginationOptionsDTO,
  TimeEntryDTO,
} from '@metric-org/sdk'

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
    const client = this.getHttpClient()

    const response = await client.get<any>('/time_entries.json', {
      params: {
        user_id: memberId,
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        limit: 100,
      },
    })

    if (response.isFailure()) throw new Error(response.failure.messageKey)

    const entries: TimeEntryDTO[] = (response.success.time_entries || []).map(
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
      total: response.success.total_count ?? entries.length,
      page: 1,
      pageSize: entries.length,
    }
  }

  public async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<TimeEntryDTO[]> {
    const client = this.getHttpClient()

    const newEntriesFound: TimeEntryDTO[] = []
    let offset = 0
    const limitPerPage = 100

    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setMonth(toDate.getMonth() - 2)

    console.log(
      `Iniciando pull. Buscando na janela de ${fromDate.toISOString()} a ${toDate.toISOString()}`,
    )

    while (true) {
      console.log(`Buscando no Redmine... Offset: ${offset}`)

      const response = await client.get<any>('/time_entries.json', {
        params: {
          user_id: memberId,
          from: fromDate.toISOString().split('T')[0],
          to: toDate.toISOString().split('T')[0],
          limit: limitPerPage,
          offset: offset,
        },
      })

      if (response.isFailure()) break

      const entriesFromApi: any[] = response.success?.time_entries || []
      if (entriesFromApi.length === 0) {
        console.log('API não retornou mais dados. Fim da busca.')
        break
      }

      const mappedEntries = entriesFromApi.map((entry: any) => {
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

        return {
          id: entry.id.toString(),
          task: { id: entry.issue.id.toString() },
          activity: {
            id: entry.activity.id.toString(),
            name: entry.activity.name,
          },
          user: { id: entry.user.id.toString(), name: entry.user.name },
          startDate,
          endDate,
          timeSpent: hours,
          comments: entry.comments,
          createdAt: new Date(entry.created_on),
          updatedAt: new Date(entry.updated_on),
        }
      })

      const pageFiltered = mappedEntries.filter((entry) => {
        const updatedTime = entry.updatedAt.getTime()
        const checkpointTime = checkpoint.updatedAt.getTime()
        if (updatedTime === checkpointTime) {
          return Number(entry.id) > Number(checkpoint.id)
        }
        return updatedTime > checkpointTime
      })

      if (pageFiltered.length > 0) newEntriesFound.push(...pageFiltered)

      if (newEntriesFound.length >= batch) {
        console.log(
          `Encontramos ${newEntriesFound.length} itens, o suficiente para o lote de ${batch}. Parando a busca por agora.`,
        )
        break
      }

      offset += limitPerPage
    }

    newEntriesFound.sort((a, b) => {
      const timeA = a.updatedAt.getTime()
      const timeB = b.updatedAt.getTime()
      if (timeA === timeB) return Number(a.id) - Number(b.id)
      return timeA - timeB
    })

    return newEntriesFound.slice(0, batch)
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
