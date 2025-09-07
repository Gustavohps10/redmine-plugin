import { Context, IConnector } from '@timelapse/sdk'

import { configurationFieldGroups, credentialFieldGroups } from '@/configFields'
import { RedmineAuthenticationStrategy } from '@/RedmineAuthenticationStrategy'
import { RedmineMemberQuery } from '@/RedmineMemberQuery'
import { RedmineTaskQuery } from '@/RedmineTaskQuery'
import { RedmineTaskRepository } from '@/RedmineTaskRepository'
import { RedmineTimeEntryQuery } from '@/RedmineTimeEntryQuery'

const RedmineConnector: IConnector = {
  id: '@timelapse/redmine-plugin',
  dataSourceType: 'redmine',
  displayName: 'Redmine (Oficial)',
  configFields: {
    configuration: configurationFieldGroups,
    credentials: credentialFieldGroups,
  },

  // eslint-disable-next-line prettier/prettier
  getAuthenticationStrategy: (context: Context) => new RedmineAuthenticationStrategy(),
  getTaskQuery: (context: Context) => new RedmineTaskQuery(),
  getTimeEntryQuery: (context: Context) => new RedmineTimeEntryQuery(context),
  getMemberQuery: (context: Context) => new RedmineMemberQuery(context),
  getTaskRepository: (context: Context) => new RedmineTaskRepository(),
}

export default RedmineConnector
