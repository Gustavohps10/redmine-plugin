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

import { RedmineClient } from '../../../client/RedmineClient'
import { RedmineIssueAPI } from '../../../types/redmine'

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
    const currentStatusName = statusMatch ? statusMatch[1].trim() : ''

    const titleParts = entry.title.split('): ')
    const cleanTitle =
      titleParts.length > 1
        ? titleParts[1].replace(/\)+$/, '').trim()
        : entry.title

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
  private recentLoggedTaskIdsCache: {
    memberId: string
    timestamp: number
    taskIds: string[]
  } | null = null

  private targetUserCache: {
    memberId: string
    fullName: string
    firstName: string
  } | null = null

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

  private async resolveTargetUser(
    memberId: string,
  ): Promise<{ fullName: string; firstName: string }> {
    if (this.targetUserCache && this.targetUserCache.memberId === memberId) {
      return this.targetUserCache
    }

    const userRes = await this.client.getUserById(memberId)
    if (userRes.isFailure()) {
      return { fullName: '', firstName: '' }
    }

    const u = userRes.success.user
    const resolved = {
      memberId,
      fullName: `${u.firstname} ${u.lastname}`.trim().toLowerCase(),
      firstName: u.firstname.trim().toLowerCase(),
    }
    this.targetUserCache = resolved
    return resolved
  }

  private async fetchLoggedTaskIds(memberId: string): Promise<string[]> {
    if (!memberId) return []

    const now = Date.now()
    if (
      this.recentLoggedTaskIdsCache &&
      this.recentLoggedTaskIdsCache.memberId === memberId &&
      now - this.recentLoggedTaskIdsCache.timestamp < 120_000
    ) {
      return this.recentLoggedTaskIdsCache.taskIds
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromStr = thirtyDaysAgo.toISOString().split('T')[0]

    const result = await this.client.listTimeEntries({
      user_id: memberId,
      from: fromStr,
      limit: '100',
    })

    if (result.isFailure()) return []

    const taskIdsSet = new Set<string>()
    for (const entry of result.success.time_entries) {
      if (entry.issue?.id) {
        taskIdsSet.add(String(entry.issue.id))
      }
    }

    const taskIds = Array.from(taskIdsSet)
    this.recentLoggedTaskIdsCache = {
      memberId,
      timestamp: now,
      taskIds,
    }

    return taskIds
  }

  private async fetchAssignedTasks(
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

  private async pullViaAtom(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>> {
    const atomKey = this.client.getAtomKey()
    const apiUrl = this.client.getApiUrl()
    const checkpointDate = checkpoint.updatedAt
    const hasValidCheckpoint =
      checkpointDate &&
      !isNaN(checkpointDate.getTime()) &&
      checkpointDate.getTime() > 0
    const checkpointTime = hasValidCheckpoint ? checkpointDate.getTime() : 0
    const isInitialPull = !hasValidCheckpoint

    let targetUser = { fullName: '', firstName: '' }
    if (memberId) {
      targetUser = await this.resolveTargetUser(memberId)
    }

    const tasksMap = new Map<string, TaskDTO>()

    const assignedRes = await this.fetchAssignedTasks(
      memberId,
      checkpoint,
      batch,
    )
    if (assignedRes.isSuccess()) {
      for (const task of assignedRes.success) {
        tasksMap.set(task.id, task)
      }
    }

    const atomRes = await this.client.getActivityAtom({
      key: atomKey,
      show_issues: '1',
      show_time_entries: '1',
    })

    if (atomRes.isSuccess()) {
      const rawXml = String(atomRes.success).trim()
      if (
        !rawXml.toLowerCase().startsWith('<!doctype html') &&
        rawXml.includes('<feed')
      ) {
        const entries = NativeAtomParser.parseEntries(rawXml)
        for (const entry of entries) {
          const entryTime = new Date(entry.updated).getTime()
          const task = AtomTaskMatcher.toTaskDTO(entry, apiUrl)
          if (!task) continue

          if (
            entryTime < checkpointTime ||
            (entryTime === checkpointTime && task.id === checkpoint.id)
          ) {
            continue
          }

          if (!AtomTaskMatcher.wasMentioned(entry, targetUser)) continue

          if (!tasksMap.has(task.id)) {
            tasksMap.set(task.id, task)
          }
        }
      }
    }

    let idsToEnrich: string[] = []
    if (isInitialPull && memberId) {
      const loggedTaskIds = await this.fetchLoggedTaskIds(memberId)
      const missingLoggedIds = loggedTaskIds.filter((id) => !tasksMap.has(id))
      idsToEnrich.push(...missingLoggedIds)
    }

    const rawAtomIds = Array.from(tasksMap.values())
      .filter((task: TaskDTO) => task.status.id === '0' || !task.description)
      .map((task: TaskDTO) => task.id)

    idsToEnrich = Array.from(new Set([...idsToEnrich, ...rawAtomIds]))

    if (idsToEnrich.length > 0) {
      const enrichedTasksRes = await this.fetchEnrichedTasks(idsToEnrich)
      if (enrichedTasksRes.isSuccess() && enrichedTasksRes.success.length > 0) {
        for (const enriched of enrichedTasksRes.success) {
          tasksMap.set(enriched.id, enriched)
        }
      }
    }

    const candidateTasks = Array.from(tasksMap.values()).sort(
      (a: TaskDTO, b: TaskDTO) => a.updatedAt.getTime() - b.updatedAt.getTime(),
    )

    return Either.success(candidateTasks)
  }

  private async fetchEnrichedTasks(
    issueIds: string[],
  ): Promise<Either<AppError, TaskDTO[]>> {
    const tasks: TaskDTO[] = []
    const BATCH_SIZE = 100

    for (let i = 0; i < issueIds.length; i += BATCH_SIZE) {
      const chunk = issueIds.slice(i, i + BATCH_SIZE)
      const issuesRes = await this.client.listIssues({
        issue_id: chunk.join(','),
        status_id: '*',
        limit: String(BATCH_SIZE),
      })

      if (issuesRes.isFailure()) return issuesRes.forwardFailure()

      for (const issue of issuesRes.success.issues) {
        tasks.push(this.mapIssueToTaskDTO(issue))
      }
    }

    return Either.success(tasks)
  }

  private async pullViaRest(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>> {
    const assignedRes = await this.fetchAssignedTasks(
      memberId,
      checkpoint,
      batch,
    )
    if (assignedRes.isFailure()) return assignedRes.forwardFailure()

    const tasksMap = new Map<string, TaskDTO>()
    for (const task of assignedRes.success) {
      tasksMap.set(task.id, task)
    }

    const checkpointDate = checkpoint.updatedAt
    const hasValidCheckpoint =
      checkpointDate &&
      !isNaN(checkpointDate.getTime()) &&
      checkpointDate.getTime() > 0
    const isInitialPull = !hasValidCheckpoint

    if (isInitialPull && memberId) {
      const loggedTaskIds = await this.fetchLoggedTaskIds(memberId)
      const missingLoggedIds = loggedTaskIds.filter((id) => !tasksMap.has(id))
      if (missingLoggedIds.length > 0) {
        const enrichedRes = await this.fetchEnrichedTasks(missingLoggedIds)
        if (enrichedRes.isSuccess()) {
          for (const enriched of enrichedRes.success) {
            tasksMap.set(enriched.id, enriched)
          }
        }
      }
    }

    const candidateTasks = Array.from(tasksMap.values()).sort(
      (a: TaskDTO, b: TaskDTO) => a.updatedAt.getTime() - b.updatedAt.getTime(),
    )

    return Either.success(candidateTasks)
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
      description: issue.description ? issue.description : undefined,
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
        name: issue.tracker.name,
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
