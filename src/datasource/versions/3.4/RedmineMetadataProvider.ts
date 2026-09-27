import {
  AppError,
  Either,
  IMetadataProvider,
  MappingFieldDefinition,
  MetadataDTO,
  MetadataItem,
} from '@mr-tick/sdk'

import { RedmineClient } from '../../../client/RedmineClient'
import {
  RedmineActivityAPI,
  RedminePriorityAPI,
  RedmineStatusAPI,
  RedmineTrackerAPI,
} from '../../../types/redmine'

function resolveActivityIcon(name: string): string {
  const normalized = name.toLowerCase()
  if (
    normalized.includes('desenvolv') ||
    normalized.includes('dev') ||
    normalized.includes('código') ||
    normalized.includes('code')
  )
    return 'Code'
  if (
    normalized.includes('reuni') ||
    normalized.includes('meet') ||
    normalized.includes('alinhamento') ||
    normalized.includes('call')
  )
    return 'CalendarCheck'
  if (
    normalized.includes('test') ||
    normalized.includes('qa') ||
    normalized.includes('homolog') ||
    normalized.includes('valida')
  )
    return 'FlaskConical'
  if (
    normalized.includes('design') ||
    normalized.includes('ui') ||
    normalized.includes('ux') ||
    normalized.includes('layout')
  )
    return 'Palette'
  if (
    normalized.includes('doc') ||
    normalized.includes('artigo') ||
    normalized.includes('especifica')
  )
    return 'FileText'
  if (
    normalized.includes('gest') ||
    normalized.includes('manag') ||
    normalized.includes('planeja') ||
    normalized.includes('scrum')
  )
    return 'Briefcase'
  if (
    normalized.includes('bug') ||
    normalized.includes('correç') ||
    normalized.includes('fix')
  )
    return 'Wrench'
  if (
    normalized.includes('review') ||
    normalized.includes('revis') ||
    normalized.includes('pr')
  )
    return 'SearchCode'
  if (
    normalized.includes('suporte') ||
    normalized.includes('atend') ||
    normalized.includes('help')
  )
    return 'LifeBuoy'
  if (
    normalized.includes('deploy') ||
    normalized.includes('release') ||
    normalized.includes('ops') ||
    normalized.includes('infra')
  )
    return 'Settings'
  return 'Tag'
}

const defaultColors = {
  badge: '#3B82F6',
  background: '#DBEAFE',
  text: '#1E40AF',
}

export class RedmineMetadataProvider implements IMetadataProvider {
  constructor(private readonly client: RedmineClient) {}

  public async getMetadata(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, MetadataDTO>> {
    const [activitiesResult, statusesResult, prioritiesResult, trackersResult] =
      await Promise.all([
        this.client.getActivities(),
        this.client.getIssueStatuses(),
        this.client.getPriorities(),
        this.client.getTrackers(),
      ])

    const activities: MetadataItem[] = activitiesResult.isSuccess()
      ? activitiesResult.success.time_entry_activities.map(
          (activity: RedmineActivityAPI) => ({
            id: String(activity.id),
            name: activity.name,
            icon: resolveActivityIcon(activity.name),
            colors: defaultColors,
          }),
        )
      : []

    const taskStatuses: MetadataItem[] = statusesResult.isSuccess()
      ? statusesResult.success.issue_statuses.map(
          (status: RedmineStatusAPI) => {
            const uiConfig = this.getStatusUiConfig(status)
            return {
              id: String(status.id),
              name: status.name,
              icon: uiConfig.icon,
              colors: uiConfig.colors,
            }
          },
        )
      : []

    const taskPriorities: MetadataItem[] = prioritiesResult.isSuccess()
      ? prioritiesResult.success.issue_priorities.map(
          (priority: RedminePriorityAPI) => ({
            id: String(priority.id),
            name: priority.name,
            icon: 'AlertCircle',
            colors: defaultColors,
          }),
        )
      : []

    const trackStatuses: MetadataItem[] = trackersResult.isSuccess()
      ? trackersResult.success.trackers.map((tracker: RedmineTrackerAPI) => ({
          id: String(tracker.id),
          name: tracker.name,
          icon: 'Bookmark',
          colors: defaultColors,
        }))
      : []

    const participantRoles: MetadataItem[] = [
      {
        id: 'assignee',
        name: 'Responsável',
        icon: 'UserCheck',
        colors: defaultColors,
      },
      {
        id: 'author',
        name: 'Autor',
        icon: 'User',
        colors: defaultColors,
      },
      {
        id: 'watcher',
        name: 'Observador',
        icon: 'Eye',
        colors: defaultColors,
      },
    ]

    const estimationTypes: MetadataItem[] = [
      {
        id: 'development',
        name: 'Desenvolvimento',
        icon: 'Code',
        colors: defaultColors,
      },
      {
        id: 'management',
        name: 'Gestão',
        icon: 'Briefcase',
        colors: defaultColors,
      },
      {
        id: 'qa',
        name: 'QA e Testes',
        icon: 'CheckSquare',
        colors: defaultColors,
      },
    ]

    return Either.success({
      activities,
      taskStatuses,
      taskPriorities,
      trackStatuses,
      participantRoles,
      estimationTypes,
    })
  }

  public async getMappingFields(): Promise<
    Either<AppError, MappingFieldDefinition[]>
  > {
    const [
      activitiesResult,
      statusesResult,
      prioritiesResult,
      trackersResult,
      customFields,
    ] = await Promise.all([
      this.client.getActivities(),
      this.client.getIssueStatuses(),
      this.client.getPriorities(),
      this.client.getTrackers(),
      this.discoverCustomFieldsFromIssues(),
    ])

    const fields: MappingFieldDefinition[] = []

    if (statusesResult.isSuccess()) {
      for (const status of statusesResult.success.issue_statuses) {
        const uiConfig = this.getStatusUiConfig(status)
        fields.push({
          id: `status_${status.id}`,
          name: status.name,
          category: 'status',
          defaultIcon: uiConfig.icon,
          defaultColor: uiConfig.colors.badge,
          description: `Status de Tarefa: ${status.name}`,
        })
      }
    }

    if (activitiesResult.isSuccess()) {
      for (const activity of activitiesResult.success.time_entry_activities) {
        fields.push({
          id: `activity_${activity.id}`,
          name: activity.name,
          category: 'activity',
          defaultIcon: resolveActivityIcon(activity.name),
          defaultColor: defaultColors.badge,
          description: `Atividade de Apontamento: ${activity.name}`,
        })
      }
    }

    if (prioritiesResult.isSuccess()) {
      for (const priority of prioritiesResult.success.issue_priorities) {
        fields.push({
          id: `priority_${priority.id}`,
          name: priority.name,
          category: 'priority',
          defaultIcon: 'AlertCircle',
          defaultColor: defaultColors.badge,
          description: `Prioridade: ${priority.name}`,
        })
      }
    }

    if (trackersResult.isSuccess()) {
      for (const tracker of trackersResult.success.trackers) {
        fields.push({
          id: `tracker_${tracker.id}`,
          name: tracker.name,
          category: 'tracker',
          defaultIcon: 'Bookmark',
          defaultColor: defaultColors.badge,
          description: `Rastreador: ${tracker.name}`,
        })
      }
    }

    fields.push(...customFields)

    return Either.success(fields)
  }

  private async discoverCustomFieldsFromIssues(): Promise<
    MappingFieldDefinition[]
  > {
    const issuesResult = await this.client.listIssues({
      status_id: '*',
      limit: '50',
    })

    if (issuesResult.isFailure()) return []

    const customFieldsMap = new Map<number, string>()
    for (const issue of issuesResult.success.issues) {
      if (!issue.custom_fields) continue
      for (const cf of issue.custom_fields) {
        if (!customFieldsMap.has(cf.id)) {
          customFieldsMap.set(cf.id, cf.name)
        }
      }
    }

    const customFields: MappingFieldDefinition[] = []
    for (const [id, name] of customFieldsMap.entries()) {
      customFields.push({
        id: `custom_field_${id}`,
        name,
        category: 'custom',
        defaultIcon: 'SlidersHorizontal',
        defaultColor: '#8B5CF6',
        description: `Campo Customizado do Redmine #${id}`,
      })
    }

    return customFields
  }

  private getStatusUiConfig(status: RedmineStatusAPI): {
    icon: string
    colors: { badge: string; background: string; text: string }
  } {
    if (status.is_closed) {
      return {
        icon: 'CheckCircle2',
        colors: { badge: '#22C55E', background: '#D1FAE5', text: '#166534' },
      }
    }

    const normalized = status.name.toLowerCase()
    if (
      normalized.includes('andamento') ||
      normalized.includes('progress') ||
      normalized.includes('execu') ||
      normalized.includes('doing') ||
      normalized.includes('fazendo')
    ) {
      return {
        icon: 'PlayCircle',
        colors: { badge: '#F59E0B', background: '#FEF3C7', text: '#78350F' },
      }
    }

    if (
      normalized.includes('bloque') ||
      normalized.includes('imped') ||
      normalized.includes('cancel') ||
      normalized.includes('rejeit') ||
      normalized.includes('parado')
    ) {
      return {
        icon: 'XCircle',
        colors: { badge: '#EF4444', background: '#FEE2E2', text: '#991B1B' },
      }
    }

    if (
      normalized.includes('revis') ||
      normalized.includes('review') ||
      normalized.includes('homolog') ||
      normalized.includes('test') ||
      normalized.includes('qa')
    ) {
      return {
        icon: 'HelpCircle',
        colors: { badge: '#A78BFA', background: '#EDE9FE', text: '#5B21B6' },
      }
    }

    if (
      normalized.includes('novo') ||
      normalized.includes('nova') ||
      normalized.includes('open') ||
      normalized.includes('abert') ||
      normalized.includes('triagem') ||
      normalized.includes('backlog')
    ) {
      return {
        icon: 'CircleDot',
        colors: { badge: '#3B82F6', background: '#DBEAFE', text: '#1E40AF' },
      }
    }

    return {
      icon: 'Circle',
      colors: defaultColors,
    }
  }
}
