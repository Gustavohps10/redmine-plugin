import { RedmineClient } from '../../client/RedmineClient'
import * as v34 from './3.4/index'
import * as v50 from './5.0/index'
import * as v60 from './6.0/index'

export interface RedmineVersionProviders {
  auth: v34.RedmineAuthenticationStrategy
  task: v34.RedmineTaskProvider
  timeEntry: v34.RedmineTimeEntryProvider
  member: v34.RedmineMemberProvider
  metadata: v34.RedmineMetadataProvider
}

export function getProvidersForVersion(
  client: RedmineClient,
  version?: string,
): RedmineVersionProviders {
  const normalizedVersion = version ? version.trim() : 'auto'

  switch (normalizedVersion) {
    case '3.4':
      return {
        auth: new v34.RedmineAuthenticationStrategy(client),
        task: new v34.RedmineTaskProvider(client),
        timeEntry: new v34.RedmineTimeEntryProvider(client),
        member: new v34.RedmineMemberProvider(client),
        metadata: new v34.RedmineMetadataProvider(client),
      }
    case '5.0':
    case '5.1':
      return {
        auth: new v50.RedmineAuthenticationStrategy(client),
        task: new v50.RedmineTaskProvider(client),
        timeEntry: new v50.RedmineTimeEntryProvider(client),
        member: new v50.RedmineMemberProvider(client),
        metadata: new v50.RedmineMetadataProvider(client),
      }
    case '6.0':
      return {
        auth: new v60.RedmineAuthenticationStrategy(client),
        task: new v60.RedmineTaskProvider(client),
        timeEntry: new v60.RedmineTimeEntryProvider(client),
        member: new v60.RedmineMemberProvider(client),
        metadata: new v60.RedmineMetadataProvider(client),
      }
    default:
      return {
        auth: new v60.RedmineAuthenticationStrategy(client),
        task: new v60.RedmineTaskProvider(client),
        timeEntry: new v60.RedmineTimeEntryProvider(client),
        member: new v60.RedmineMemberProvider(client),
        metadata: new v60.RedmineMetadataProvider(client),
      }
  }
}

export * from './3.4/index'
