import {
  AnalyticsColumnSchema,
  AnalyticsDatasetCellValue,
  AnalyticsDatasetRow,
} from '@mr-tick/sdk'

import {
  RedmineCustomField,
  RedmineIssueAPI,
  RedmineTimeEntryAPI,
} from '../../types/redmine'

/** Missing native fields remain null, never fabricated domain defaults. */
export function nullable(
  value: AnalyticsDatasetCellValue | undefined,
): AnalyticsDatasetCellValue {
  if (value === undefined) return null
  return value
}

export function addCustomFields(
  row: AnalyticsDatasetRow,
  fields: RedmineCustomField[] | undefined,
  columns: Map<string, AnalyticsColumnSchema>,
): void {
  if (fields === undefined) return

  for (const field of fields) {
    const key = `custom_field_${field.id}`
    let value: string | null = null
    if (typeof field.value === 'string') value = field.value
    if (Array.isArray(field.value)) value = JSON.stringify(field.value)
    row[key] = value
    columns.set(key, {
      name: key,
      label: field.name,
      type: 'string',
      origin: 'custom',
      providerFieldId: String(field.id),
    })
  }
}

export function issueRow(
  issue: RedmineIssueAPI,
  columns: Map<string, AnalyticsColumnSchema>,
): AnalyticsDatasetRow {
  const row: AnalyticsDatasetRow = {
    id: issue.id,
    project_id: issue.project.id,
    project: issue.project.name,
    subject: issue.subject,
    description: nullable(issue.description),
    parent_id: nullable(issue.parent?.id),
    tracker_id: nullable(issue.tracker?.id),
    tracker: nullable(issue.tracker?.name),
    status_id: issue.status.id,
    status: issue.status.name,
    is_closed: nullable(issue.status.is_closed),
    priority_id: nullable(issue.priority?.id),
    priority: nullable(issue.priority?.name),
    author_id: nullable(issue.author?.id),
    author: nullable(issue.author?.name),
    assignee_id: nullable(issue.assigned_to?.id),
    assignee: nullable(issue.assigned_to?.name),
    target_version_id: nullable(issue.fixed_version?.id),
    target_version: nullable(issue.fixed_version?.name),
    estimated_hours: nullable(issue.estimated_hours),
    spent_hours: nullable(issue.spent_hours),
    done_ratio: nullable(issue.done_ratio),
    created_date: issue.created_on,
    updated_date: issue.updated_on,
    closed_date: nullable(issue.closed_on),
    start_date: nullable(issue.start_date),
    due_date: nullable(issue.due_date),
  }
  addCustomFields(row, issue.custom_fields, columns)
  return row
}

export function timeEntryRow(
  entry: RedmineTimeEntryAPI,
  columns: Map<string, AnalyticsColumnSchema>,
): AnalyticsDatasetRow {
  const row: AnalyticsDatasetRow = {
    id: entry.id,
    project_id: entry.project.id,
    project: entry.project.name,
    date: entry.spent_on,
    user_id: entry.user.id,
    user: entry.user.name,
    activity_id: entry.activity.id,
    activity: entry.activity.name,
    issue_id: nullable(entry.issue?.id),
    comment: nullable(entry.comments),
    hours: entry.hours,
    created_date: entry.created_on,
    updated_date: entry.updated_on,
  }
  addCustomFields(row, entry.custom_fields, columns)
  return row
}
