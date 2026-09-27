import {
  AddonSettingsSchema,
  DataSourceContext,
  Either,
  IDataSource,
  IDataSourceInstance,
} from '@mr-tick/sdk'

import { configurationFieldGroups, credentialFieldGroups } from './configFields'
import { RedmineClient } from '../client/RedmineClient'
import { getProvidersForVersion } from './versions/index'

export class RedmineDataSource implements IDataSource {
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
      authStrategy: providers.auth,
      tasksProvider: providers.task,
      timeEntriesProvider: providers.timeEntry,
      membersProvider: providers.member,
      metadataProvider: providers.metadata,
      testConnection: async () => {
        const userResult = await client.getCurrentUser()
        if (userResult.isFailure()) {
          return Either.success({
            ok: false,
            message: userResult.failure.messageKey,
          })
        }

        const user = userResult.success.user
        return Either.success({
          ok: true,
          message: `Conectado com sucesso como ${user.firstname} ${user.lastname}`,
          latencyMs: 150,
        })
      },
    }
  }
}
