import {
  AnalyticsColumnSchema,
  AnalyticsColumnType,
  AnalyticsDatasetManifest,
  AnalyticsExtractionDescriptor,
  AnalyticsFilterDefinition,
} from '@mr-tick/sdk'

function column(
  name: string,
  type: AnalyticsColumnType,
): AnalyticsColumnSchema {
  return { name, label: name, type, origin: 'native' }
}

function projectFilter(): AnalyticsFilterDefinition {
  return {
    id: 'project_id',
    label: 'Projeto',
    type: 'select',
    required: true,
    dynamicOptionsSource: 'projects',
  }
}

function issueFilter(): AnalyticsFilterDefinition {
  return { id: 'issue_id', label: 'ID da tarefa', type: 'text', required: true }
}

function dataset(
  id: string,
  name: string,
  endpoint: string,
  selection: { dateRange: boolean; project: boolean },
  extraction: AnalyticsExtractionDescriptor,
  columns: AnalyticsColumnSchema[],
  supportedFilters: AnalyticsFilterDefinition[],
): AnalyticsDatasetManifest {
  return {
    id,
    name,
    description: endpoint,
    endpoint,
    sourceFormat: 'json',
    selection,
    extraction,
    columns,
    supportedFilters,
  }
}

const project: AnalyticsFilterDefinition = {
  id: 'project_id',
  label: 'Projeto',
  type: 'select',
  dynamicOptionsSource: 'projects',
}

const defaultExtraction: AnalyticsExtractionDescriptor = {
  modes: ['snapshot'],
  identity: { kind: 'row', columns: ['id'] },
}

export const REDMINE_ANALYTICS_DATASETS: AnalyticsDatasetManifest[] = [
  dataset(
    'redmine_time_entries',
    'Apontamentos',
    '/time_entries.json',
    { dateRange: true, project: true },
    {
      modes: ['snapshot'],
      identity: { kind: 'row', columns: ['id'] },
      windowRescan: { dateColumn: 'date' },
    },
    [
      column('id', 'number'),
      column('project_id', 'number'),
      column('project', 'string'),
      column('date', 'date'),
      column('user_id', 'number'),
      column('user', 'string'),
      column('activity_id', 'number'),
      column('activity', 'string'),
      column('issue_id', 'number'),
      column('comment', 'string'),
      {
        name: 'hours',
        label: 'Horas',
        type: 'number',
        unit: 'hours',
        origin: 'native',
      },
      column('created_date', 'date'),
      column('updated_date', 'date'),
    ],
    [
      project,
      {
        id: 'user_id',
        label: 'Usuários',
        type: 'multi_select',
        dynamicOptionsSource: 'members',
      },
      {
        id: 'activity_id',
        label: 'Atividades',
        type: 'multi_select',
        dynamicOptionsSource: 'activities',
      },
    ],
  ),
  dataset(
    'redmine_issues',
    'Tarefas',
    '/issues.json',
    { dateRange: true, project: true },
    {
      modes: ['snapshot', 'changes'],
      identity: { kind: 'row', columns: ['id'] },
      changes: { deletions: 'none' },
    },
    [
      column('id', 'number'),
      column('project_id', 'number'),
      column('project', 'string'),
      column('parent_id', 'number'),
      column('subject', 'string'),
      column('description', 'string'),
      column('tracker_id', 'number'),
      column('tracker', 'string'),
      column('status_id', 'number'),
      column('status', 'string'),
      column('is_closed', 'boolean'),
      column('priority_id', 'number'),
      column('priority', 'string'),
      column('author_id', 'number'),
      column('author', 'string'),
      column('assignee_id', 'number'),
      column('assignee', 'string'),
      column('target_version_id', 'number'),
      column('target_version', 'string'),
      column('estimated_hours', 'number'),
      column('spent_hours', 'number'),
      column('done_ratio', 'number'),
      column('created_date', 'date'),
      column('updated_date', 'date'),
      column('closed_date', 'date'),
      column('start_date', 'date'),
      column('due_date', 'date'),
    ],
    [
      project,
      {
        id: 'assigned_to_id',
        label: 'Responsáveis',
        type: 'multi_select',
        dynamicOptionsSource: 'members',
      },
      {
        id: 'status_id',
        label: 'Situação',
        type: 'multi_select',
        dynamicOptionsSource: 'task_statuses',
      },
      {
        id: 'tracker_id',
        label: 'Rastreador',
        type: 'multi_select',
        dynamicOptionsSource: 'task_trackers',
      },
      {
        id: 'closed_date_range',
        label: 'Data de fechamento',
        type: 'date_range',
      },
      {
        id: 'updated_date_range',
        label: 'Data de atualização',
        type: 'date_range',
      },
    ],
  ),
  dataset(
    'redmine_projects',
    'Projetos',
    '/projects.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('name', 'string'),
      column('identifier', 'string'),
      column('description', 'string'),
      column('status', 'number'),
      column('is_public', 'boolean'),
      column('created_date', 'date'),
      column('updated_date', 'date'),
    ],
    [],
  ),
  dataset(
    'redmine_users',
    'Usuários',
    '/users.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('login', 'string'),
      column('name', 'string'),
      column('firstname', 'string'),
      column('lastname', 'string'),
      column('mail', 'string'),
      column('status', 'number'),
      column('created_date', 'date'),
      column('last_login_date', 'date'),
    ],
    [],
  ),
  dataset(
    'redmine_versions',
    'Versões',
    '/projects/:id/versions.json',
    { dateRange: false, project: true },
    defaultExtraction,
    [
      column('id', 'number'),
      column('project_id', 'number'),
      column('project', 'string'),
      column('name', 'string'),
      column('description', 'string'),
      column('status', 'string'),
      column('due_date', 'date'),
      column('sharing', 'string'),
      column('created_date', 'date'),
      column('updated_date', 'date'),
    ],
    [projectFilter()],
  ),
  dataset(
    'redmine_memberships',
    'Membros',
    '/projects/:id/memberships.json',
    { dateRange: false, project: true },
    defaultExtraction,
    [
      column('id', 'number'),
      column('project_id', 'number'),
      column('project', 'string'),
      column('user_id', 'number'),
      column('user', 'string'),
      column('group_id', 'number'),
      column('group', 'string'),
      column('roles', 'string'),
    ],
    [projectFilter()],
  ),
  dataset(
    'redmine_issue_categories',
    'Categorias',
    '/projects/:id/issue_categories.json',
    { dateRange: false, project: true },
    defaultExtraction,
    [
      column('id', 'number'),
      column('project_id', 'number'),
      column('project', 'string'),
      column('name', 'string'),
      column('assignee_id', 'number'),
      column('assignee', 'string'),
    ],
    [projectFilter()],
  ),
  dataset(
    'redmine_issue_relations',
    'Relações',
    '/issues/:id/relations.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('issue_id', 'number'),
      column('issue_to_id', 'number'),
      column('relation_type', 'string'),
      column('delay', 'number'),
    ],
    [issueFilter()],
  ),
  dataset(
    'redmine_issue_journals',
    'Histórico',
    '/issues/:id.json?include=journals',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('issue_id', 'number'),
      column('user_id', 'number'),
      column('user', 'string'),
      column('notes', 'string'),
      column('created_date', 'date'),
      column('details', 'string'),
    ],
    [issueFilter()],
  ),
  dataset(
    'redmine_issue_statuses',
    'Situações',
    '/issue_statuses.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('name', 'string'),
      column('is_closed', 'boolean'),
    ],
    [],
  ),
  dataset(
    'redmine_trackers',
    'Rastreadores',
    '/trackers.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [column('id', 'number'), column('name', 'string')],
    [],
  ),
  dataset(
    'redmine_activities',
    'Atividades',
    '/enumerations/time_entry_activities.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('name', 'string'),
      column('is_default', 'boolean'),
    ],
    [],
  ),
  dataset(
    'redmine_priorities',
    'Prioridades',
    '/enumerations/issue_priorities.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('name', 'string'),
      column('is_default', 'boolean'),
    ],
    [],
  ),
  dataset(
    'redmine_groups',
    'Grupos',
    '/groups.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [column('id', 'number'), column('name', 'string')],
    [],
  ),
  dataset(
    'redmine_queries',
    'Consultas',
    '/queries.json',
    { dateRange: false, project: false },
    defaultExtraction,
    [
      column('id', 'number'),
      column('name', 'string'),
      column('is_public', 'boolean'),
      column('project_id', 'number'),
    ],
    [],
  ),
]

const issuesDataset = REDMINE_ANALYTICS_DATASETS.find(
  (item) => item.id === 'redmine_issues',
)

if (issuesDataset !== undefined)
  REDMINE_ANALYTICS_DATASETS.push({
    ...issuesDataset,
    id: 'redmine_issue_discovery',
    name: 'Descoberta recente de tarefas',
    description: 'activity.atom → issues.json (feed limitado)',
    endpoint: '/activity.atom → /issues.json',
    selection: { dateRange: true, project: true },
    extraction: {
      modes: ['snapshot'],
      identity: { kind: 'row', columns: ['id'] },
    },
    supportedFilters: [project],
  })
