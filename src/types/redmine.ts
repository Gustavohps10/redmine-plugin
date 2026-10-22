export type RedmineIdName = {
  id: number
  name: string
}

export type RedmineCustomField = {
  id: number
  name: string
  value?: string | string[] | null
  multiple?: boolean
}

export type RedmineUserAPI = {
  id: number
  login?: string
  admin?: boolean
  firstname: string
  lastname: string
  mail?: string
  created_on: string
  last_login_on?: string | null
  api_key?: string
  custom_fields?: RedmineCustomField[]
}

export type RedmineUserResponse = {
  user: RedmineUserAPI
}

export type RedmineUsersResponse = {
  users: RedmineUserAPI[]
  total_count: number
  offset: number
  limit: number
}

export type RedmineIssueAPI = {
  id: number
  project: RedmineIdName
  tracker?: RedmineIdName
  status: RedmineIdName
  priority?: RedmineIdName
  author?: RedmineIdName
  assigned_to?: RedmineIdName
  subject: string
  description?: string
  start_date?: string | null
  due_date?: string | null
  done_ratio?: number
  estimated_hours?: number | null
  spent_hours?: number
  created_on: string
  updated_on: string
  custom_fields?: RedmineCustomField[]
}

export type RedmineIssuesResponse = {
  issues: RedmineIssueAPI[]
  total_count: number
  offset: number
  limit: number
}

export type RedmineIssueResponse = {
  issue: RedmineIssueAPI
}

export type RedmineTimeEntryAPI = {
  id: number
  project: RedmineIdName
  issue?: { id: number }
  user: RedmineIdName
  activity: RedmineIdName
  hours: number
  comments?: string | null
  spent_on: string
  created_on: string
  updated_on: string
  custom_fields?: RedmineCustomField[]
}

export type RedmineTimeEntriesResponse = {
  time_entries: RedmineTimeEntryAPI[]
  total_count: number
  offset: number
  limit: number
}

export type RedmineTimeEntryResponse = {
  time_entry: RedmineTimeEntryAPI
}

export type RedmineCreateTimeEntryPayload = {
  time_entry: {
    issue_id: number
    activity_id: number
    hours: number
    comments?: string
    spent_on: string
    user_id?: number
  }
}

export type RedmineUpdateTimeEntryPayload = {
  time_entry: {
    issue_id?: number
    activity_id?: number
    hours?: number
    comments?: string
    spent_on?: string
  }
}

export type RedmineActivityAPI = {
  id: number
  name: string
  is_default?: boolean
}

export type RedmineActivitiesResponse = {
  time_entry_activities: RedmineActivityAPI[]
}

export type RedmineStatusAPI = {
  id: number
  name: string
  is_closed?: boolean
}

export type RedmineStatusesResponse = {
  issue_statuses: RedmineStatusAPI[]
}

export type RedminePriorityAPI = {
  id: number
  name: string
  is_default?: boolean
}

export type RedminePrioritiesResponse = {
  issue_priorities: RedminePriorityAPI[]
}

export type RedmineTrackerAPI = {
  id: number
  name: string
}

export type RedmineTrackersResponse = {
  trackers: RedmineTrackerAPI[]
}
