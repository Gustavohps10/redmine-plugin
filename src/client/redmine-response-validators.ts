import type { JsonValue } from '@mr-tick/sdk'

import type {
  RedmineActivitiesResponse,
  RedmineActivityAPI,
  RedmineCustomField,
  RedmineIdName,
  RedmineIssueAPI,
  RedmineIssueResponse,
  RedmineIssuesResponse,
  RedminePrioritiesResponse,
  RedminePriorityAPI,
  RedmineStatusAPI,
  RedmineStatusesResponse,
  RedmineTimeEntriesResponse,
  RedmineTimeEntryAPI,
  RedmineTimeEntryResponse,
  RedmineTrackerAPI,
  RedmineTrackersResponse,
  RedmineUserAPI,
  RedmineUserResponse,
} from '../types/redmine'

function isObject(
  value: JsonValue | undefined,
): value is { [key: string]: JsonValue } {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

export function isRedmineIdName(
  value: JsonValue | undefined,
): value is RedmineIdName {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.name === 'string'
  )
}

export function isRedmineCustomField(
  value: JsonValue | undefined,
): value is RedmineCustomField {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.name === 'string' &&
    (value.value === undefined ||
      typeof value.value === 'string' ||
      (Array.isArray(value.value) &&
        value.value.every((item) => typeof item === 'string')) ||
      value.value === null) &&
    (value.multiple === undefined || typeof value.multiple === 'boolean')
  )
}

export function isRedmineUserAPI(
  value: JsonValue | undefined,
): value is RedmineUserAPI {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    (value.login === undefined || typeof value.login === 'string') &&
    (value.admin === undefined || typeof value.admin === 'boolean') &&
    typeof value.firstname === 'string' &&
    typeof value.lastname === 'string' &&
    (value.mail === undefined || typeof value.mail === 'string') &&
    typeof value.created_on === 'string' &&
    (value.last_login_on === undefined ||
      value.last_login_on === null ||
      typeof value.last_login_on === 'string') &&
    (value.api_key === undefined || typeof value.api_key === 'string') &&
    (value.custom_fields === undefined ||
      (Array.isArray(value.custom_fields) &&
        value.custom_fields.every((item) => isRedmineCustomField(item))))
  )
}

export function isRedmineUserResponse(
  value: JsonValue | undefined,
): value is RedmineUserResponse {
  if (!isObject(value)) return false
  return isRedmineUserAPI(value.user)
}

export function isRedmineIssueAPI(
  value: JsonValue | undefined,
): value is RedmineIssueAPI {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    isRedmineIdName(value.project) &&
    (value.tracker === undefined || isRedmineIdName(value.tracker)) &&
    isRedmineIdName(value.status) &&
    (value.priority === undefined || isRedmineIdName(value.priority)) &&
    (value.author === undefined || isRedmineIdName(value.author)) &&
    (value.assigned_to === undefined || isRedmineIdName(value.assigned_to)) &&
    typeof value.subject === 'string' &&
    (value.description === undefined ||
      typeof value.description === 'string') &&
    (value.start_date === undefined ||
      value.start_date === null ||
      typeof value.start_date === 'string') &&
    (value.due_date === undefined ||
      value.due_date === null ||
      typeof value.due_date === 'string') &&
    (value.done_ratio === undefined ||
      (typeof value.done_ratio === 'number' &&
        Number.isFinite(value.done_ratio))) &&
    (value.estimated_hours === undefined ||
      value.estimated_hours === null ||
      (typeof value.estimated_hours === 'number' &&
        Number.isFinite(value.estimated_hours))) &&
    (value.spent_hours === undefined ||
      (typeof value.spent_hours === 'number' &&
        Number.isFinite(value.spent_hours))) &&
    typeof value.created_on === 'string' &&
    typeof value.updated_on === 'string' &&
    (value.custom_fields === undefined ||
      (Array.isArray(value.custom_fields) &&
        value.custom_fields.every((item) => isRedmineCustomField(item))))
  )
}

export function isRedmineIssuesResponse(
  value: JsonValue | undefined,
): value is RedmineIssuesResponse {
  if (!isObject(value)) return false
  return (
    Array.isArray(value.issues) &&
    value.issues.every((item) => isRedmineIssueAPI(item)) &&
    typeof value.total_count === 'number' &&
    Number.isFinite(value.total_count) &&
    typeof value.offset === 'number' &&
    Number.isFinite(value.offset) &&
    typeof value.limit === 'number' &&
    Number.isFinite(value.limit)
  )
}

export function isRedmineIssueResponse(
  value: JsonValue | undefined,
): value is RedmineIssueResponse {
  if (!isObject(value)) return false
  return isRedmineIssueAPI(value.issue)
}

export function isRedmineTimeEntryAPI(
  value: JsonValue | undefined,
): value is RedmineTimeEntryAPI {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    isRedmineIdName(value.project) &&
    (value.issue === undefined ||
      (isObject(value.issue) &&
        typeof value.issue.id === 'number' &&
        Number.isFinite(value.issue.id))) &&
    isRedmineIdName(value.user) &&
    isRedmineIdName(value.activity) &&
    typeof value.hours === 'number' &&
    Number.isFinite(value.hours) &&
    (value.comments === undefined ||
      value.comments === null ||
      typeof value.comments === 'string') &&
    typeof value.spent_on === 'string' &&
    typeof value.created_on === 'string' &&
    typeof value.updated_on === 'string' &&
    (value.custom_fields === undefined ||
      (Array.isArray(value.custom_fields) &&
        value.custom_fields.every((item) => isRedmineCustomField(item))))
  )
}

export function isRedmineTimeEntriesResponse(
  value: JsonValue | undefined,
): value is RedmineTimeEntriesResponse {
  if (!isObject(value)) return false
  return (
    Array.isArray(value.time_entries) &&
    value.time_entries.every((item) => isRedmineTimeEntryAPI(item)) &&
    typeof value.total_count === 'number' &&
    Number.isFinite(value.total_count) &&
    typeof value.offset === 'number' &&
    Number.isFinite(value.offset) &&
    typeof value.limit === 'number' &&
    Number.isFinite(value.limit)
  )
}

export function isRedmineTimeEntryResponse(
  value: JsonValue | undefined,
): value is RedmineTimeEntryResponse {
  if (!isObject(value)) return false
  return isRedmineTimeEntryAPI(value.time_entry)
}

export function isRedmineActivityAPI(
  value: JsonValue | undefined,
): value is RedmineActivityAPI {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.name === 'string' &&
    (value.is_default === undefined || typeof value.is_default === 'boolean')
  )
}

export function isRedmineActivitiesResponse(
  value: JsonValue | undefined,
): value is RedmineActivitiesResponse {
  if (!isObject(value)) return false
  return (
    Array.isArray(value.time_entry_activities) &&
    value.time_entry_activities.every((item) => isRedmineActivityAPI(item))
  )
}

export function isRedmineStatusAPI(
  value: JsonValue | undefined,
): value is RedmineStatusAPI {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.name === 'string' &&
    (value.is_closed === undefined || typeof value.is_closed === 'boolean')
  )
}

export function isRedmineStatusesResponse(
  value: JsonValue | undefined,
): value is RedmineStatusesResponse {
  if (!isObject(value)) return false
  return (
    Array.isArray(value.issue_statuses) &&
    value.issue_statuses.every((item) => isRedmineStatusAPI(item))
  )
}

export function isRedminePriorityAPI(
  value: JsonValue | undefined,
): value is RedminePriorityAPI {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.name === 'string' &&
    (value.is_default === undefined || typeof value.is_default === 'boolean')
  )
}

export function isRedminePrioritiesResponse(
  value: JsonValue | undefined,
): value is RedminePrioritiesResponse {
  if (!isObject(value)) return false
  return (
    Array.isArray(value.issue_priorities) &&
    value.issue_priorities.every((item) => isRedminePriorityAPI(item))
  )
}

export function isRedmineTrackerAPI(
  value: JsonValue | undefined,
): value is RedmineTrackerAPI {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.name === 'string'
  )
}

export function isRedmineTrackersResponse(
  value: JsonValue | undefined,
): value is RedmineTrackersResponse {
  if (!isObject(value)) return false
  return (
    Array.isArray(value.trackers) &&
    value.trackers.every((item) => isRedmineTrackerAPI(item))
  )
}

export function isTextResponse(value: JsonValue): value is string {
  return typeof value === 'string'
}
