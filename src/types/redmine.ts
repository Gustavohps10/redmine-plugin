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
  status?: number
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

export type RedmineJournalDetailAPI = {
  property: string
  name: string
  old_value?: string | null
  new_value?: string | null
}

export type RedmineJournalAPI = {
  id: number
  user?: RedmineIdName
  notes?: string | null
  created_on: string
  details?: RedmineJournalDetailAPI[]
}

export type RedmineIssueAPI = {
  id: number
  parent?: { id: number }
  project: RedmineIdName
  tracker?: RedmineIdName
  status: RedmineIdName & { is_closed?: boolean }
  priority?: RedmineIdName
  author?: RedmineIdName
  assigned_to?: RedmineIdName
  fixed_version?: RedmineIdName
  subject: string
  description?: string | null
  start_date?: string | null
  due_date?: string | null
  done_ratio?: number
  estimated_hours?: number | null
  spent_hours?: number
  created_on: string
  updated_on: string
  closed_on?: string | null
  custom_fields?: RedmineCustomField[]
  journals?: RedmineJournalAPI[]
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

export type RedmineProjectAPI = {
  id: number
  name: string
  identifier: string
  description?: string | null
  status: number
  is_public?: boolean
  created_on: string
  updated_on: string
}

export type RedmineProjectsResponse = {
  projects: RedmineProjectAPI[]
  total_count: number
  offset: number
  limit: number
}

export type RedmineVersionAPI = {
  id: number
  project: RedmineIdName
  name: string
  description?: string | null
  status: string
  due_date?: string | null
  sharing?: string
  created_on: string
  updated_on: string
}

export type RedmineVersionsResponse = {
  versions: RedmineVersionAPI[]
  total_count?: number
}

export type RedmineMembershipRoleAPI = {
  id: number
  name: string
  inherited?: boolean
}

export type RedmineMembershipAPI = {
  id: number
  project: RedmineIdName
  user?: RedmineIdName
  group?: RedmineIdName
  roles: RedmineMembershipRoleAPI[]
}

export type RedmineMembershipsResponse = {
  memberships: RedmineMembershipAPI[]
  total_count?: number
  offset?: number
  limit?: number
}

export type RedmineIssueRelationAPI = {
  id: number
  issue_id: number
  issue_to_id: number
  relation_type: string
  delay?: number | null
}

export type RedmineIssueRelationsResponse = {
  relations: RedmineIssueRelationAPI[]
}

export type RedmineIssueCategoryAPI = {
  id: number
  project?: RedmineIdName
  name: string
  assigned_to?: RedmineIdName
}

export type RedmineIssueCategoriesResponse = {
  issue_categories: RedmineIssueCategoryAPI[]
  total_count?: number
}

export type RedmineGroupAPI = {
  id: number
  name: string
}

export type RedmineGroupsResponse = {
  groups: RedmineGroupAPI[]
}

export type RedmineQueryAPI = {
  id: number
  name: string
  is_public: boolean
  project_id?: number | null
}

export type RedmineQueriesResponse = {
  queries: RedmineQueryAPI[]
  total_count?: number
  offset?: number
  limit?: number
}
