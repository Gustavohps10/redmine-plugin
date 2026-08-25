import { DataSourceContext, IDataSource } from '@metric-org/sdk'

import { configurationFieldGroups, credentialFieldGroups } from './configFields'
import { RedmineAuthenticationStrategy } from './RedmineAuthenticationStrategy'
import { RedmineMemberQuery } from './RedmineMemberQuery'
import { RedmineMetadataQuery } from './RedmineMetadataQuery'
import { RedmineTaskQuery } from './RedmineTaskQuery'
import { RedmineTaskRepository } from './RedmineTaskRepository'
import { RedmineTimeEntryQuery } from './RedmineTimeEntryQuery'
import { RedmineTimeEntryRepository } from './RedmineTimeEntryRepository'

export class RedmineDataSource implements IDataSource {
  readonly id = 'gustavohps10-redmine'
  readonly dataSourceType = 'redmine'
  readonly displayName = 'Redmine (Oficial)'
  readonly configFields = {
    configuration: configurationFieldGroups,
    credentials: credentialFieldGroups,
  }

  getAuthenticationStrategy(_context: DataSourceContext) {
    return new RedmineAuthenticationStrategy()
  }

  getTaskQuery(context: DataSourceContext) {
    return new RedmineTaskQuery(context)
  }

  getTimeEntryQuery(context: DataSourceContext) {
    return new RedmineTimeEntryQuery(context)
  }

  getTimeEntryRepository(context: DataSourceContext) {
    return new RedmineTimeEntryRepository(context)
  }

  getMemberQuery(context: DataSourceContext) {
    return new RedmineMemberQuery(context)
  }

  getTaskRepository(_context: DataSourceContext) {
    return new RedmineTaskRepository()
  }

  getMetadataQuery(context: DataSourceContext) {
    return new RedmineMetadataQuery(context)
  }
}
