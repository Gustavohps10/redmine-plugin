export interface RedmineIdName {
  id: number
  name: string
}

export interface RedmineCustomField {
  id: number
  name: string
  value: string
}

export interface RedmineUserAPI {
  id: number
  login: string
  admin?: boolean
  firstname: string
  lastname: string
  mail?: string
  created_on: string
  last_login_on?: string
  api_key?: string
  custom_fields?: RedmineCustomField[]
}

export interface RedmineUserResponse {
  user: RedmineUserAPI
}

export interface RedmineUsersResponse {
  users: RedmineUserAPI[]
  total_count: number
  offset: number
  limit: number
}

export interface RedmineIssueAPI {
  id: number
  project: RedmineIdName
  tracker?: RedmineIdName
  status: RedmineIdName
  priority?: RedmineIdName
  author?: RedmineIdName
  assigned_to?: RedmineIdName
  subject: string
  description?: string
  start_date?: string
  due_date?: string
  done_ratio?: number
  estimated_hours?: number
  spent_hours?: number
  created_on: string
  updated_on: string
}

export interface RedmineIssuesResponse {
  issues: RedmineIssueAPI[]
  total_count: number
  offset: number
  limit: number
}

export interface RedmineIssueResponse {
  issue: RedmineIssueAPI
}

export interface RedmineTimeEntryAPI {
  id: number
  project: RedmineIdName
  issue?: { id: number }
  user: RedmineIdName
  activity: RedmineIdName
  hours: number
  comments?: string
  spent_on: string
  created_on: string
  updated_on: string
}

export interface RedmineTimeEntriesResponse {
  time_entries: RedmineTimeEntryAPI[]
  total_count: number
  offset: number
  limit: number
}

export interface RedmineTimeEntryResponse {
  time_entry: RedmineTimeEntryAPI
}

export interface RedmineCreateTimeEntryPayload {
  time_entry: {
    issue_id: number
    activity_id: number
    hours: number
    comments?: string
    spent_on: string
    user_id?: number
  }
}

export interface RedmineUpdateTimeEntryPayload {
  time_entry: {
    issue_id?: number
    activity_id?: number
    hours?: number
    comments?: string
    spent_on?: string
  }
}

export interface RedmineActivityAPI {
  id: number
  name: string
  is_default?: boolean
}

export interface RedmineActivitiesResponse {
  time_entry_activities: RedmineActivityAPI[]
}

export interface RedmineStatusAPI {
  id: number
  name: string
  is_closed?: boolean
}

export interface RedmineStatusesResponse {
  issue_statuses: RedmineStatusAPI[]
}

export interface RedminePriorityAPI {
  id: number
  name: string
  is_default?: boolean
}

export interface RedminePrioritiesResponse {
  issue_priorities: RedminePriorityAPI[]
}

export interface RedmineTrackerAPI {
  id: number
  name: string
}

export interface RedmineTrackersResponse {
  trackers: RedmineTrackerAPI[]
}
