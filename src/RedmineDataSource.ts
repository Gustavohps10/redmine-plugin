import {
  AddonSettingsSchema,
  DataSourceContext,
  Either,
  IDataSource,
  IDataSourceInstance,
} from '@mr-tick/sdk'

import { configurationFieldGroups, credentialFieldGroups } from './configFields.js'
import { RedmineAuthenticationStrategy } from './RedmineAuthenticationStrategy.js'
import { RedmineClient } from './RedmineClient.js'
import { RedmineMemberProvider } from './RedmineMemberProvider.js'
import { RedmineMetadataProvider } from './RedmineMetadataProvider.js'
import { RedmineTaskProvider } from './RedmineTaskProvider.js'
import { RedmineTimeEntryProvider } from './RedmineTimeEntryProvider.js'

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

    return {
      authStrategy: new RedmineAuthenticationStrategy(client),
      tasksProvider: new RedmineTaskProvider(client),
      timeEntriesProvider: new RedmineTimeEntryProvider(client),
      membersProvider: new RedmineMemberProvider(client),
      metadataProvider: new RedmineMetadataProvider(client),
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
