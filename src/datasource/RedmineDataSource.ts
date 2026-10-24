import {
  DataSourceContext,
  IDataSource,
  IDataSourceInstance,
} from '@mr-tick/sdk'

import { RedmineClient } from '../client/RedmineClient'
import { getProvidersForVersion } from './versions/index'

export class RedmineDataSource implements IDataSource {
  createInstance(context: DataSourceContext): IDataSourceInstance {
    const client = RedmineClient.fromContext(context)
    const providers = getProvidersForVersion(client, client.getVersion())

    return {
      tasksProvider: providers.task,
      timeEntriesProvider: providers.timeEntry,
      membersProvider: providers.member,
      metadataProvider: providers.metadata,
    }
  }
}
