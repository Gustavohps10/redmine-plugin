import {
  AppError,
  Either,
  IMetadataProvider,
  MetadataDTO,
  MetadataItem,
} from '@mr-tick/sdk'

import { RedmineClient } from './RedmineClient.js'

import {
  RedmineActivityAPI,
  RedminePriorityAPI,
  RedmineStatusAPI,
  RedmineTrackerAPI,
} from './types/redmine.js'

const activityIconMap: Record<string, string> = {
  '8': 'Palette',
  '9': 'Code',
  '10': 'BarChart2',
  '11': 'CalendarCheck',
  '12': 'CheckCircle',
  '13': 'FlaskConical',
  '14': 'SearchCode',
  '15': 'Settings',
  '16': 'Wrench',
  '17': 'LifeBuoy',
  '18': 'Handshake',
  '19': 'ClipboardCheck',
  '25': 'FileText',
  '26': 'GraduationCap',
  '27': 'Users',
  '28': 'Briefcase',
  '30': 'ShieldCheck',
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
          (activity: RedmineActivityAPI) => {
            const icon = activityIconMap[String(activity.id)]
            return {
              id: String(activity.id),
              name: activity.name,
              icon: icon ? icon : 'Tag',
              colors: defaultColors,
            }
          },
        )
      : []

    const taskStatuses: MetadataItem[] = statusesResult.isSuccess()
      ? statusesResult.success.issue_statuses.map(
          (status: RedmineStatusAPI) => {
            const uiConfig = this.getStatusUiConfig(status.id)
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

  private getStatusUiConfig(statusId: number): {
    icon: string
    colors: { badge: string; background: string; text: string }
  } {
    switch (statusId) {
      case 1:
        return {
          icon: 'CircleDot',
          colors: { badge: '#3B82F6', background: '#DBEAFE', text: '#1E40AF' },
        }
      case 2:
        return {
          icon: 'PlayCircle',
          colors: { badge: '#F59E0B', background: '#FEF3C7', text: '#78350F' },
        }
      case 3:
        return {
          icon: 'CheckCircle2',
          colors: { badge: '#22C55E', background: '#D1FAE5', text: '#166534' },
        }
      case 4:
        return {
          icon: 'HelpCircle',
          colors: { badge: '#A78BFA', background: '#EDE9FE', text: '#5B21B6' },
        }
      case 5:
        return {
          icon: 'Archive',
          colors: { badge: '#64748B', background: '#F1F5F9', text: '#334155' },
        }
      case 6:
        return {
          icon: 'XCircle',
          colors: { badge: '#EF4444', background: '#FEE2E2', text: '#991B1B' },
        }
      default:
        return {
          icon: 'Circle',
          colors: defaultColors,
        }
    }
  }
}
