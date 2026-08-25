import { IMetadataQuery, MetadataDTO, MetadataItem } from '@metric-org/sdk'

import { RedmineBase } from '@/RedmineBase'

// Mapeamento de ícones para atividades, mantido como estava.
const activityIconMap = new Map<string, string>([
  ['8', 'Palette'],
  ['9', 'Code'],
  ['10', 'BarChart2'],
  ['11', 'CalendarCheck'],
  ['12', 'CheckCircle'],
  ['13', 'FlaskConical'],
  ['14', 'SearchCode'],
  ['15', 'Settings'],
  ['16', 'Wrench'],
  ['17', 'LifeBuoy'],
  ['18', 'Handshake'],
  ['19', 'ClipboardCheck'],
  ['25', 'FileText'],
  ['26', 'GraduationCap'],
  ['27', 'Users'],
  ['28', 'Briefcase'],
  ['30', 'ShieldCheck'],
])

// Centralizando as paletas de cores para reutilização e consistência
const colorPalettes = {
  blue: { badge: '#3B82F6', background: '#DBEAFE', text: '#1E40AF' },
  amber: { badge: '#F59E0B', background: '#FEF3C7', text: '#78350F' },
  violet: { badge: '#A78BFA', background: '#EDE9FE', text: '#5B21B6' },
  pink: { badge: '#EC4899', background: '#FCE7F3', text: '#9D174D' },
  green: { badge: '#22C55E', background: '#D1FAE5', text: '#166534' },
  red: { badge: '#EF4444', background: '#FEE2E2', text: '#991B1B' },
  orange: { badge: '#F97316', background: '#FFEDD5', text: '#9A3412' },
  teal: { badge: '#14B8A6', background: '#CCFBF1', text: '#0F766E' },
  slate: { badge: '#64748B', background: '#F1F5F9', text: '#334155' },
  // Cores específicas para prioridades que podem ter apenas texto
  priorityLow: { badge: '#4ADE80', background: '#DCFCE7', text: '#166534' },
  priorityMedium: { badge: '#FACC15', background: '#FEF9C3', text: '#713F12' },
  priorityHigh: { badge: '#F87171', background: '#FEE2E2', text: '#991B1B' },
}

export class RedmineMetadataQuery
  extends RedmineBase
  implements IMetadataQuery
{
  public async getMetadata(): Promise<MetadataDTO> {
    console.log('METADATA: Iniciando busca de metadados...')
    try {
      const client = this.getHttpClient()

      const results = await Promise.allSettled([
        client.get<any>('issue_statuses.json'),
        client.get<any>('enumerations/issue_priorities.json'),
        client.get<any>('enumerations/time_entry_activities.json'),
        client.get<any>('trackers.json'),
      ])

      const processResult = (
        result: PromiseSettledResult<any>,
        name: string,
        dataKey: string,
      ): any[] => {
        if (result.status === 'fulfilled' && result.value.isSuccess()) {
          const data = result.value.success?.[dataKey] as any[]
          if (data) {
            console.log(
              `METADATA: Buscados ${data.length} item(s) para '${name}'.`,
            )
            return data
          }
          console.warn(
            `METADATA: Resposta para '${name}' não continha a chave esperada '${dataKey}'.`,
          )
          return []
        } else {
          console.error(`METADATA: Falha ao buscar metadados para '${name}'.`)
          return []
        }
      }

      const rawStatuses = processResult(
        results[0],
        'Status de Tarefas',
        'issue_statuses',
      )
      const rawPriorities = processResult(
        results[1],
        'Prioridades',
        'issue_priorities',
      )
      const rawActivities = processResult(
        results[2],
        'Atividades',
        'time_entry_activities',
      )
      const rawTrackers = processResult(results[3], 'Trackers', 'trackers')

      console.log('METADATA: Mapeando dados recebidos da API...')
      const taskStatuses = this._mapStatuses(rawStatuses)
      const taskPriorities = this._mapPriorities(rawPriorities)
      const activities = this._mapActivities(rawActivities)
      const trackStatuses = this._mapTrackers(rawTrackers)

      console.log(
        'METADATA: Gerando metadados estáticos para Papéis de Participante...',
      )
      const participantRoles = this._getParticipantRoles()

      console.log(
        'METADATA: Gerando metadados estáticos para Tipos de Tempo Estimado...',
      )
      const estimationTypes = this._getEstimationTypes()

      console.log('METADATA: Mapeamento de metadados concluído com sucesso.')

      return {
        taskStatuses,
        taskPriorities,
        activities,
        trackStatuses,
        participantRoles,
        estimationTypes,
      }
    } catch (error) {
      console.error(
        'METADATA: Erro geral inesperado ao buscar metadados:',
        error,
      )
      return {
        taskStatuses: [],
        taskPriorities: [],
        activities: [],
        trackStatuses: [],
        participantRoles: [],
        estimationTypes: [],
      }
    }
  }

  private _mapStatuses(
    statuses: { id: number; name: string }[],
  ): MetadataItem[] {
    return (statuses || []).map((status) => {
      const uiConfig = this._getUiConfigForStatus(status.id)
      return {
        id: status.id.toString(),
        name: status.name,
        icon: uiConfig.icon,
        colors: uiConfig.colors,
      }
    })
  }

  private _mapPriorities(
    priorities: { id: number; name: string }[],
  ): MetadataItem[] {
    return (priorities || []).map((priority) => {
      const uiConfig = this._getUiConfigForPriority(priority.id)
      return {
        id: priority.id.toString(),
        name: priority.name,
        icon: uiConfig.icon,
        colors: uiConfig.colors,
      }
    })
  }

  private _mapActivities(
    activities: { id: number; name: string }[],
  ): MetadataItem[] {
    // Para garantir cores variadas, vamos alternar entre as paletas.
    const availablePalettes = [
      colorPalettes.blue,
      colorPalettes.amber,
      colorPalettes.violet,
      colorPalettes.pink,
      colorPalettes.green,
      colorPalettes.red,
      colorPalettes.orange,
      colorPalettes.teal,
    ]
    return (activities || []).map((activity, index) => ({
      id: activity.id.toString(),
      name: activity.name,
      icon: activityIconMap.get(activity.id.toString()) || 'Activity',
      colors: availablePalettes[index % availablePalettes.length], // Roda as cores
    }))
  }

  private _mapTrackers(
    trackers: { id: number; name: string }[],
  ): MetadataItem[] {
    return (trackers || []).map((tracker) => {
      const uiConfig = this._getUiConfigForTracker(tracker.id)
      return {
        id: tracker.id.toString(),
        name: tracker.name,
        icon: uiConfig.icon,
        colors: uiConfig.colors,
      }
    })
  }

  private _getParticipantRoles(): MetadataItem[] {
    const roles: MetadataItem[] = [
      {
        id: '5',
        name: 'Autor',
        icon: 'User',
        colors: colorPalettes.slate,
      },
      {
        id: 'assignee',
        name: 'Atribuído',
        icon: 'UserCheck',
        colors: colorPalettes.blue,
      },
      {
        id: '1',
        name: 'Testador',
        icon: 'FlaskConical',
        colors: colorPalettes.violet,
      },
      {
        id: '2',
        name: 'Revisor',
        icon: 'SearchCode',
        colors: colorPalettes.orange,
      },
      {
        id: '3',
        name: 'Responsável Tarefa',
        icon: 'ClipboardCheck',
        colors: colorPalettes.amber,
      },
      {
        id: '4',
        name: 'Analista',
        icon: 'GraduationCap',
        colors: colorPalettes.teal,
      },
    ]
    return roles
  }

  private _getEstimationTypes(): MetadataItem[] {
    const types: MetadataItem[] = [
      {
        id: '1',
        name: 'Produção',
        icon: 'Code',
        colors: colorPalettes.green,
      },
      {
        id: '2',
        name: 'Validação',
        icon: 'ClipboardCheck',
        colors: colorPalettes.amber,
      },
      {
        id: '3',
        name: 'Documentação',
        icon: 'FileText',
        colors: colorPalettes.blue,
      },
      {
        id: '4',
        name: 'Geral',
        icon: 'Clock',
        colors: colorPalettes.slate,
      },
    ]
    return types
  }

  private _getUiConfigForStatus(statusId: number): {
    icon: string
    colors: MetadataItem['colors']
  } {
    switch (statusId) {
      case 1: // New
      case 25:
        return { icon: 'Timer', colors: colorPalettes.blue }
      case 2: // In Progress
      case 20:
      case 8:
      case 10:
      case 26:
        return { icon: 'Zap', colors: colorPalettes.amber }
      case 24: // Feedback
      case 28:
      case 7:
      case 9:
      case 11:
        return { icon: 'PauseCircle', colors: colorPalettes.orange }
      case 19: // Rejected
      case 6: // Closed (but not resolved)
      case 23:
      case 15:
        return { icon: 'CircleX', colors: colorPalettes.red }
      case 21: // Resolved
      case 22:
      case 27:
      case 18:
      case 3: // Done
      case 14:
        return { icon: 'CheckCircle2', colors: colorPalettes.green }
      case 12: // Archived
      case 13:
        return { icon: 'ArchiveX', colors: colorPalettes.slate }
      default:
        return { icon: 'HelpCircle', colors: colorPalettes.slate }
    }
  }

  private _getUiConfigForPriority(priorityId: number): {
    icon: string
    colors: MetadataItem['colors']
  } {
    switch (priorityId) {
      case 1: // Low
        return { icon: 'ArrowDown', colors: colorPalettes.priorityLow }
      case 2: // Normal
        return { icon: 'ArrowRight', colors: colorPalettes.priorityMedium }
      case 3: // High
      case 4: // Urgent
      case 5: // Immediate
        return { icon: 'ArrowUp', colors: colorPalettes.priorityHigh }
      default:
        return { icon: 'Minus', colors: colorPalettes.slate }
    }
  }

  private _getUiConfigForTracker(trackerId: number): {
    icon: string
    colors: MetadataItem['colors']
  } {
    switch (trackerId) {
      case 1: // Bug
        return { icon: 'Bug', colors: colorPalettes.red }
      case 2: // Feature
        return { icon: 'Star', colors: colorPalettes.violet }
      case 3: // Support
        return { icon: 'LifeBuoy', colors: colorPalettes.blue }
      default:
        return { icon: 'Tag', colors: colorPalettes.slate }
    }
  }
}
