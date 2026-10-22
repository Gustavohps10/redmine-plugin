import {
  AddonSettingsSchema,
  ConnectionProfileDescriptor,
  DataSourceContext,
  IDataSource,
  IDataSourceInstance,
} from '@mr-tick/sdk'

import { RedmineClient } from '../client/RedmineClient'
import { configurationFieldGroups, credentialFieldGroups } from './configFields'
import { getProvidersForVersion } from './versions/index'

export class RedmineDataSource implements IDataSource {
  getConnectionProfiles(): ConnectionProfileDescriptor[] {
    return [
      {
        connectionProfileId: 'redmine-instance',
        cardinality: 'multi',
        default: true,
      },
    ]
  }

  getConnectionSchema(): AddonSettingsSchema {
    return [
      {
        id: 'credentials',
        label: 'Credenciais',
        groups: credentialFieldGroups,
      },
      {
        id: 'configuration',
        label: 'Configurações',
        groups: configurationFieldGroups,
      },
    ]
  }

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
