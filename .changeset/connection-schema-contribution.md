---
"@mr-tick/redmine-plugin": minor
---

Use the published SDK 0.12 with an updated dependency and lockfile. Register account input schemas through contributions.connections.registerSchema, independently of datasource providers, and handle rejected schema registration before activating addon features. The official SDK CLI generates packages requiring API >=0.12.0; the release pipeline updates the manifest after the addon version is applied.
