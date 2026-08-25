 
import {
  IHttpClient,
  ITaskQuery,
  PagedResultDTO,
  PaginationOptionsDTO,
  TaskDTO,
} from '@metric-org/sdk'

import { RedmineBase } from '@/RedmineBase'

// --- TYPES & DTOs ---
interface RedmineUserDTO {
  id: number
  firstname: string
  lastname: string
  mail?: string
}

interface AtomEntryDTO {
  id: string
  title: string
  updated: string
  authorName: string
  contentHtml: string
  rawXmlBlock?: string
}

// --- HELPER: Delay assíncrono nativo ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// --- SOLID: S - Responsabilidade Única (Resolução e Cache de Usuários) ---
class RedmineUserResolver {
  private static userCache = new Map<
    string,
    { fullName: string; firstName: string }
  >()

  public static async resolveUserNames(
    client: IHttpClient,
    memberId: string,
  ): Promise<{ fullName: string; firstName: string }> {
    if (this.userCache.has(memberId)) {
      return this.userCache.get(memberId)!
    }

    try {
      const response = await client.get<{ user: RedmineUserDTO }>(
        `users/${memberId}.json`,
      )
      if (response.isSuccess() && response.success.user) {
        const user = response.success.user
        const fullName = `${user.firstname} ${user.lastname}`.trim()
        const resolved = {
          fullName: fullName.toLowerCase(),
          firstName: user.firstname.trim().toLowerCase(),
        }
        this.userCache.set(memberId, resolved)
        return resolved
      }
    } catch (err: any) {
      console.warn(
        `[REDMINE_USER_RESOLVER] Falha ao obter usuário ${memberId}:`,
        err.message,
      )
    }

    return { fullName: '', firstName: '' }
  }
}

// --- SOLID: S - Parser Nativo via Regex (Sem dependências externas) ---
class NativeAtomParser {
  public static parseEntries(xmlText: string): AtomEntryDTO[] {
    const entries: AtomEntryDTO[] = []
    const entryBlocks = xmlText.match(/<entry>[\s\S]*?<\/entry>/gi) || []

    for (const block of entryBlocks) {
      const idMatch = block.match(/<id>([\s\S]*?)<\/id>/i)
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i)
      const updatedMatch = block.match(/<updated>([\s\S]*?)<\/updated>/i)
      const authorMatch = block.match(
        /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i,
      )
      const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)

      entries.push({
        id: idMatch ? idMatch[1].trim() : '',
        title: titleMatch ? this.decodeEntities(titleMatch[1].trim()) : '',
        updated: updatedMatch ? updatedMatch[1].trim() : '',
        authorName: authorMatch
          ? this.decodeEntities(authorMatch[1].trim())
          : '',
        contentHtml: contentMatch
          ? this.decodeEntities(contentMatch[1].trim())
          : '',
        rawXmlBlock: block,
      })
    }

    return entries
  }

  private static decodeEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }
}

// --- SOLID: S - Responsabilidade Única (Validação de Regra de Match In-Memory) ---
class AtomTaskMatcher {
  /**
   * Verifica se o usuário foi citado ou está presente em qualquer parte da entrada do Atom (XML completo ou campos)
   */
  public static wasMentioned(
    entry: AtomEntryDTO,
    userNames: { fullName: string; firstName: string },
  ): boolean {
    if (!userNames.fullName && !userNames.firstName) return true

    const fullName = userNames.fullName
      ? userNames.fullName.trim().toLowerCase()
      : ''
    const firstName = userNames.firstName
      ? userNames.firstName.trim().toLowerCase()
      : ''

    const searchableText =
      `${entry.authorName} ${entry.title} ${entry.contentHtml} ${entry.rawXmlBlock || ''}`.toLowerCase()

    if (fullName && searchableText.includes(fullName)) {
      return true
    }

    if (firstName && searchableText.includes(firstName)) {
      return true
    }

    return false
  }

  public static isEntryRelatedToUser(
    entry: AtomEntryDTO,
    userNames: { fullName: string; firstName: string },
  ): boolean {
    return this.wasMentioned(entry, userNames)
  }

  public static toTaskDTO(entry: AtomEntryDTO, apiUrl: string): TaskDTO | null {
    const issueIdMatch = entry.title.match(/#(\d+)/)
    if (!issueIdMatch) return null
    const issueId = issueIdMatch[1]

    const statusMatch = entry.title.match(/\((.*?)\):/)
    const currentStatusName = statusMatch ? statusMatch[1].trim() : 'Nova'

    const titleParts = entry.title.split('): ')
    const cleanTitle =
      titleParts.length > 1 ? titleParts[1].trim() : entry.title

    const projectName = entry.title.includes(' - ')
      ? entry.title.split(' - ')[0].trim()
      : undefined

    const updatedAtDate = new Date(entry.updated)

    return {
      id: issueId,
      url: `${apiUrl}/issues/${issueId}`,
      title: cleanTitle,
      projectName: projectName,
      status: {
        id: '0',
        name: currentStatusName,
      },
      author: entry.authorName
        ? {
            name: entry.authorName,
          }
        : undefined,
      createdAt: updatedAtDate,
      updatedAt: updatedAtDate,
    }
  }
}

// --- CLASSE PRINCIPAL ---
export class RedmineTaskQuery extends RedmineBase implements ITaskQuery {
  public async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<TaskDTO[]> {
    const client = this.getHttpClient()
    const apiUrl = (this.context?.config?.apiUrl as string) || ''
    const checkpointTime = checkpoint.updatedAt
      ? checkpoint.updatedAt.getTime()
      : 0
    const limitPerRequest = 100

    // 1. Resolução dos nomes do usuário alvo
    const targetUser = await RedmineUserResolver.resolveUserNames(
      client,
      memberId,
    )

    console.log(
      `[RxDB REPLICATION PULL] INICIADO | Checkpoint Entrada: ID="${checkpoint.id || 'Nenhum'}", UpdatedAt="${checkpoint.updatedAt ? checkpoint.updatedAt.toISOString() : 'Nenhum'}" | User="${targetUser.fullName}" | Batch=${batch}`,
    )

    let cursorDate = new Date() // Inicia a busca a partir de HOJE (trazendo o feed do mais recente para o mais antigo)
    let hasMoreHistory = true
    const visitedDates = new Set<string>()

    const tasksMap = new Map<string, TaskDTO>()
    const baseUrl = 'activity.atom'

    const apiKey = (this.context?.credentials?.apiKey as string) || ''
    const atomKey =
      (this.context?.credentials?.atomKey as string) ||
      (this.context?.credentials?.rssKey as string) ||
      apiKey

    const MAX_REQUESTS = 50 // Previne loops infinitos no Atom

    while (hasMoreHistory && visitedDates.size < MAX_REQUESTS) {
      const formattedDate = cursorDate.toISOString().split('T')[0]

      console.log(
        `[REDMINE_PULL][LOOP] Consultando Atom Feed em 'from=${formattedDate}' | Checkpoint RxDB Alvo: ${checkpoint.updatedAt ? checkpoint.updatedAt.toISOString() : 'Nenhum'}`,
      )

      if (visitedDates.has(formattedDate)) {
        console.warn(
          `[REDMINE_PULL][ATOM] Data ${formattedDate} já foi consultada. Finalizando iteração para evitar loop.`,
        )
        hasMoreHistory = false
        break
      }

      visitedDates.add(formattedDate)

      try {
        const response = await client.get<string>(baseUrl, {
          params: {
            key: atomKey,
            show_issues: 1,
            limit: limitPerRequest,
            from: formattedDate,
          },
          headers: {
            'X-Redmine-API-Key': '',
            Accept: 'application/atom+xml, application/xml, text/xml, */*',
          },
          responseType: 'text',
        })

        if (response.isFailure()) {
          console.error(
            `[REDMINE_PULL][ATOM][ERROR] Falha na requisição HTTP em ${formattedDate}:`,
            response.failure.messageKey,
          )
          hasMoreHistory = false
          break
        }

        const rawXml = String(response.success).trim()

        if (
          rawXml.toLowerCase().startsWith('<!doctype html') ||
          rawXml.toLowerCase().startsWith('<html') ||
          !rawXml.includes('<feed')
        ) {
          console.error(
            `[REDMINE_PULL][ATOM][ERROR] Resposta INVÁLIDA em ${formattedDate}. O Redmine retornou HTML ao invés do XML Feed Atom. Verifique a Chave do Atom.`,
          )
          hasMoreHistory = false
          break
        }

        console.log(
          `[REDMINE_PULL][ATOM][SUCESSO] XML Feed Atom recebido em ${formattedDate} (${rawXml.length} bytes)`,
        )

        const entries = NativeAtomParser.parseEntries(rawXml)
        console.log(
          `[REDMINE_PULL][ATOM] Foram encontradas ${entries.length} entrada(s) no XML em ${formattedDate}`,
        )

        if (entries.length > 0) {
          console.log(
            `[REDMINE_PULL][ATOM][AMOSTRA] 1ª Entrada -> Autor: "${entries[0].authorName}", Atualizado: "${entries[0].updated}", Título: "${entries[0].title.slice(0, 60)}"`,
          )
        }

        if (entries.length === 0) {
          hasMoreHistory = false
          break
        }

        let reachedCheckpoint = false
        let oldestDateInBatch: Date | null = null

        for (const entry of entries) {
          const entryTime = new Date(entry.updated).getTime()
          const entryDate = new Date(entry.updated)

          if (!oldestDateInBatch || entryDate < oldestDateInBatch) {
            oldestDateInBatch = entryDate
          }

          const task = AtomTaskMatcher.toTaskDTO(entry, apiUrl)
          if (!task) continue

          if (
            entryTime < checkpointTime ||
            (entryTime === checkpointTime && task.id === checkpoint.id)
          ) {
            reachedCheckpoint = true
            continue
          }

          if (!AtomTaskMatcher.isEntryRelatedToUser(entry, targetUser)) {
            continue
          }

          if (!tasksMap.has(task.id)) {
            tasksMap.set(task.id, task)
            console.log(
              `[REDMINE_PULL][MATCH] + Tarefa Adicionada #${task.id}: "${task.title.slice(0, 50)}" (${task.status.name})`,
            )
          } else {
            const existingTask = tasksMap.get(task.id)!
            if (task.updatedAt >= existingTask.updatedAt) {
              existingTask.title = task.title
              existingTask.status = task.status
              existingTask.updatedAt = task.updatedAt
            }
          }
        }

        console.log(
          `[REDMINE_PULL][ATOM] Progresso: ${tasksMap.size} tarefas acumuladas (Lendo histórico para trás). Replicou até checkpoint? ${reachedCheckpoint ? 'SIM' : 'NÃO'}`,
        )

        // Se já alcançamos eventos iguais ou mais antigos que o checkpoint, ou se a página veio com menos de itens que o limite
        if (reachedCheckpoint || entries.length < limitPerRequest) {
          hasMoreHistory = false
          break
        }

        // Recua a data em pelo menos 1 dia para garantir avanço de página no próximo ciclo
        if (oldestDateInBatch) {
          const nextDate = new Date(
            oldestDateInBatch.getTime() - 24 * 60 * 60 * 1000,
          )
          const nextFormatted = nextDate.toISOString().split('T')[0]
          if (nextFormatted === formattedDate) {
            cursorDate.setDate(cursorDate.getDate() - 1)
          } else {
            cursorDate = nextDate
          }
        } else {
          cursorDate.setDate(cursorDate.getDate() - 1)
        }
      } catch (error: any) {
        console.error(
          `[REDMINE_PULL][ATOM][ERROR] Falha ao consultar feed em ${formattedDate}:`,
          error.message,
        )
        hasMoreHistory = false
      }
    }

    // Ordena as tarefas do mais antigo para o mais recente (updatedAt ASC) para o RxDB avançar o checkpoint corretamente
    const resultTasks = Array.from(tasksMap.values())
      .sort(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      )
      .slice(0, batch)

    console.log(
      `[RxDB REPLICATION PULL] FINALIZADO -> Retornando ${resultTasks.length} tarefa(s) (Ordenadas updatedAt ASC). ${resultTasks.length > 0 ? `Novo Checkpoint: ID="${resultTasks[resultTasks.length - 1].id}", UpdatedAt="${new Date(resultTasks[resultTasks.length - 1].updatedAt).toISOString()}"` : 'Sem novas tarefas.'}`,
    )

    return resultTasks
  }

  // // =========================================================================
  // // FALLBACK REST API: /issues.json (Nativa com X-Redmine-API-Key)
  // // =========================================================================
  // public async pullLegacy(
  //   memberId: string,
  //   checkpoint: { updatedAt: Date; id: string },
  //   batch: number,
  // ): Promise<TaskDTO[]> {
  //   const client = await this.getAuthenticatedClient()
  //   const checkpointDate = checkpoint.updatedAt.toISOString().split('.')[0]
  //   const limitPerRequest = 100

  //   const fetchAllPages = async (queryParams: object): Promise<any[]> => {
  //     const allIssuesForFilter: any[] = []
  //     let offset = 0
  //     let keepFetching = true

  //     while (keepFetching) {
  //       try {
  //         const response = await client.get('issues.json', {
  //           params: {
  //             ...queryParams,
  //             status_id: '*',
  //             limit: limitPerRequest,
  //             offset,
  //           },
  //         })

  //         const receivedIssues = response.data?.issues
  //         if (receivedIssues?.length) {
  //           allIssuesForFilter.push(...receivedIssues)
  //         }

  //         if (!receivedIssues || receivedIssues.length < limitPerRequest) {
  //           keepFetching = false
  //         } else {
  //           offset += limitPerRequest
  //         }
  //       } catch (error: any) {
  //         keepFetching = false
  //       }
  //     }
  //     return allIssuesForFilter
  //   }

  //   const customFieldIds = [8, 9, 16, 24]
  //   const baseSearchParams = {
  //     updated_on: `>=${checkpointDate}`,
  //     sort: 'updated_on:asc,id:asc',
  //   }
  //   const trackerIdsToPull = [3, 5, 11, 12, 13, 19]

  //   const fetchPromises = [
  //     fetchAllPages({ ...baseSearchParams, assigned_to_id: memberId }),
  //     fetchAllPages({ ...baseSearchParams, author_id: memberId }),
  //     ...customFieldIds.map((fieldId) =>
  //       fetchAllPages({ ...baseSearchParams, [`cf_${fieldId}`]: memberId }),
  //     ),
  //     fetchAllPages({
  //       ...baseSearchParams,
  //       tracker_id: trackerIdsToPull.join('|'),
  //     }),
  //   ]

  //   const resultsFromAllPages = await Promise.all(fetchPromises)
  //   const allIssues = resultsFromAllPages.flatMap((list) => list)
  //   const uniqueIssuesMap = new Map(allIssues.map((issue) => [issue.id, issue]))
  //   const sortedUniqueIssues = Array.from(uniqueIssuesMap.values()).sort(
  //     (a, b) => {
  //       const dateA = new Date(a.updated_on).getTime()
  //       const dateB = new Date(b.updated_on).getTime()
  //       if (dateA !== dateB) return dateA - dateB
  //       return a.id - b.id
  //     },
  //   )

  //   const newTasksFound: TaskDTO[] = []
  //   for (const issue of sortedUniqueIssues) {
  //     if (
  //       issue.updated_on === checkpointDate &&
  //       Number(issue.id) <= Number(checkpoint.id)
  //     ) {
  //       continue
  //     }

  //     newTasksFound.push({
  //       id: issue.id.toString(),
  //       url: `${this.context?.config?.apiUrl}/issues/${issue.id}`,
  //       title: issue.subject,
  //       projectName: issue.project?.name,
  //       status: {
  //         id: issue.status.id.toString(),
  //         name: issue.status.name,
  //       },
  //       author: issue.author
  //         ? { id: issue.author.id.toString(), name: issue.author.name }
  //         : undefined,
  //       createdAt: new Date(issue.created_on),
  //       updatedAt: new Date(issue.updated_on),
  //     })

  //     if (newTasksFound.length >= batch) break
  //   }

  //   return newTasksFound.slice(0, batch)
  // }

  findAll(pagination?: PaginationOptionsDTO): Promise<PagedResultDTO<TaskDTO>> {
    throw new Error('Method findAll RedmineTaskQuery not implemented.')
  }

  findById(id: string): Promise<TaskDTO | undefined> {
    throw new Error('Method findById RedmineTaskQuery not implemented.')
  }

  findByIds(ids: string[]): Promise<TaskDTO[]> {
    throw new Error('Method findByIds RedmineTaskQuery not implemented.')
  }

  findByCondition(
    condition: Partial<TaskDTO>,
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<TaskDTO>> {
    throw new Error('Method findByCondition RedmineTaskQuery not implemented.')
  }

  count(criteria?: Partial<TaskDTO>): Promise<number> {
    throw new Error('Method count RedmineTaskQuery not implemented.')
  }

  exists(criteria: Partial<TaskDTO>): Promise<boolean> {
    throw new Error('Method exists RedmineTaskQuery not implemented.')
  }
}
