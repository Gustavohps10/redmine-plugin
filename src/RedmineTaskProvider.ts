import {
  AppError,
  CreatedTaskResult,
  Either,
  ITaskProvider,
  PagedResultDTO,
  PaginationOptionsDTO,
  TaskDTO,
  UpdatedTaskResult,
} from '@mr-tick/sdk'

import { RedmineClient } from './RedmineClient.js'
import { RedmineIssueAPI } from './types/redmine.js'

interface AtomEntryDTO {
  id: string
  title: string
  updated: string
  authorName: string
  contentHtml: string
  rawXmlBlock?: string
}

class NativeAtomParser {
  public static parseEntries(xmlText: string): AtomEntryDTO[] {
    const entries: AtomEntryDTO[] = []
    const entryBlocks = xmlText.match(/<entry>[\s\S]*?<\/entry>/gi)
    if (!entryBlocks) return entries

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

class AtomTaskMatcher {
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

    const rawBlock = entry.rawXmlBlock ? entry.rawXmlBlock : ''
    const searchableText =
      `${entry.authorName} ${entry.title} ${entry.contentHtml} ${rawBlock}`.toLowerCase()

    if (fullName && searchableText.includes(fullName)) return true
    if (firstName && searchableText.includes(firstName)) return true

    return false
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
      url: apiUrl ? `${apiUrl}/issues/${issueId}` : undefined,
      title: cleanTitle,
      projectName,
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

export class RedmineTaskProvider implements ITaskProvider {
  constructor(private readonly client: RedmineClient) {}

  public async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>> {
    if (this.client.getAtomKey()) {
      return this.pullViaAtom(memberId, checkpoint, batch)
    }

    return this.pullViaRest(memberId, checkpoint, batch)
  }

  private async pullViaAtom(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>> {
    const atomKey = this.client.getAtomKey()
    const apiUrl = this.client.getApiUrl()
    const checkpointTime = checkpoint.updatedAt
      ? checkpoint.updatedAt.getTime()
      : 0

    let targetUser = { fullName: '', firstName: '' }
    if (memberId) {
      const userRes = await this.client.getUserById(memberId)
      if (userRes.isSuccess()) {
        const u = userRes.success.user
        targetUser = {
          fullName: `${u.firstname} ${u.lastname}`.trim().toLowerCase(),
          firstName: u.firstname.trim().toLowerCase(),
        }
      }
    }

    let cursorDate = new Date()
    let hasMoreHistory = true
    const visitedDates = new Set<string>()
    const tasksMap = new Map<string, TaskDTO>()
    const MAX_REQUESTS = 50

    while (hasMoreHistory && visitedDates.size < MAX_REQUESTS) {
      const formattedDate = cursorDate.toISOString().split('T')[0]
      if (visitedDates.has(formattedDate)) break
      visitedDates.add(formattedDate)

      const atomRes = await this.client.getActivityAtom({
        key: atomKey,
        show_issues: '1',
        limit: '100',
        from: formattedDate,
      })

      if (atomRes.isFailure()) break

      const rawXml = String(atomRes.success).trim()
      if (
        rawXml.toLowerCase().startsWith('<!doctype html') ||
        !rawXml.includes('<feed')
      )
        break

      const entries = NativeAtomParser.parseEntries(rawXml)
      if (entries.length === 0) break

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

        if (!AtomTaskMatcher.wasMentioned(entry, targetUser)) continue

        if (!tasksMap.has(task.id)) {
          tasksMap.set(task.id, task)
        }
      }

      if (reachedCheckpoint || entries.length < 100) break

      if (oldestDateInBatch) {
        const nextDate = new Date(
          oldestDateInBatch.getTime() - 24 * 60 * 60 * 1000,
        )
        const nextFormatted = nextDate.toISOString().split('T')[0]
        if (nextFormatted === formattedDate) {
          cursorDate.setDate(cursorDate.getDate() - 1)
        }
        if (nextFormatted !== formattedDate) {
          cursorDate = nextDate
        }
      }
      if (!oldestDateInBatch) {
        cursorDate.setDate(cursorDate.getDate() - 1)
      }
    }

    const resultTasks = Array.from(tasksMap.values())
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, batch)

    return Either.success(resultTasks)
  }

  private async pullViaRest(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>> {
    const params: Record<string, string> = {
      status_id: '*',
      sort: 'updated_on:asc,id:asc',
      limit: batch > 0 ? String(Math.min(batch, 100)) : '100',
    }

    if (memberId) params.assigned_to_id = memberId

    const checkpointDate = checkpoint.updatedAt
    const hasValidCheckpoint =
      checkpointDate &&
      !isNaN(checkpointDate.getTime()) &&
      checkpointDate.getTime() > 0

    if (hasValidCheckpoint) {
      params.updated_on = `>=${checkpointDate.toISOString().split('.')[0]}Z`
    }

    const issuesResult = await this.client.listIssues(params)
    if (issuesResult.isFailure()) return issuesResult.forwardFailure()

    const rawIssues = issuesResult.success.issues
    const mappedTasks: TaskDTO[] = []

    for (const issue of rawIssues) {
      const task = this.mapIssueToTaskDTO(issue)
      if (hasValidCheckpoint) {
        const issueTime = task.updatedAt.getTime()
        const checkTime = checkpointDate.getTime()
        if (issueTime < checkTime) continue
        if (issueTime === checkTime && Number(task.id) <= Number(checkpoint.id))
          continue
      }
      mappedTasks.push(task)
      if (mappedTasks.length >= batch) break
    }

    return Either.success(mappedTasks)
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TaskDTO>>> {
    const page = pagination?.page ? pagination.page : 1
    const pageSize = pagination?.pageSize ? pagination.pageSize : 25
    const offset = (page - 1) * pageSize

    const params: Record<string, string> = {
      status_id: '*',
      limit: String(pageSize),
      offset: String(offset),
    }

    const issuesResult = await this.client.listIssues(params)
    if (issuesResult.isFailure()) return issuesResult.forwardFailure()

    const items = issuesResult.success.issues.map((issue: RedmineIssueAPI) =>
      this.mapIssueToTaskDTO(issue),
    )

    return Either.success({
      items,
      total: issuesResult.success.total_count,
      page,
      pageSize,
    })
  }

  public async findById(id: string): Promise<Either<AppError, TaskDTO | null>> {
    const issueResult = await this.client.getIssueById(id)
    if (issueResult.isFailure()) {
      if (issueResult.failure.statusCode === 404) return Either.success(null)
      return issueResult.forwardFailure()
    }

    const task = this.mapIssueToTaskDTO(issueResult.success.issue)
    return Either.success(task)
  }

  public async create(
    task: TaskDTO,
  ): Promise<Either<AppError, CreatedTaskResult>> {
    return Either.success({
      id: task.id,
      updatedAt: task.updatedAt,
    })
  }

  public async update(
    task: TaskDTO,
  ): Promise<Either<AppError, UpdatedTaskResult>> {
    return Either.success({
      id: task.id,
      updatedAt: task.updatedAt,
    })
  }

  public async delete(id: string): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }

  private mapIssueToTaskDTO(issue: RedmineIssueAPI): TaskDTO {
    const apiUrl = this.client.getApiUrl()
    const task: TaskDTO = {
      id: String(issue.id),
      title: issue.subject,
      description: issue.description,
      url: apiUrl ? `${apiUrl}/issues/${issue.id}` : undefined,
      projectName: issue.project ? issue.project.name : undefined,
      status: {
        id: String(issue.status.id),
        name: issue.status.name,
      },
      createdAt: new Date(issue.created_on),
      updatedAt: new Date(issue.updated_on),
    }

    if (issue.priority) {
      task.priority = {
        id: String(issue.priority.id),
        name: issue.priority.name,
      }
    }

    if (issue.author) {
      task.author = {
        id: String(issue.author.id),
        name: issue.author.name,
      }
    }

    if (issue.assigned_to) {
      task.assignedTo = {
        id: String(issue.assigned_to.id),
        name: issue.assigned_to.name,
      }
    }

    if (issue.tracker) {
      task.tracker = {
        id: String(issue.tracker.id),
      }
    }

    if (issue.start_date) task.startDate = new Date(issue.start_date)
    if (issue.due_date) task.dueDate = new Date(issue.due_date)
    if (typeof issue.done_ratio === 'number') task.doneRatio = issue.done_ratio
    if (typeof issue.spent_hours === 'number')
      task.spentHours = issue.spent_hours

    return task
  }
}
