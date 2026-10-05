---
"@mr-tick/redmine-plugin": minor
---

Adopt the required SDK snapshot page contract for time-entry pulls. Revisit changes to existing entries even when Redmine returns the same updated_on timestamp, using complete validated snapshots and stateless cursors. This release requires the updated SDK and host contract; no branch for the previous pull format remains.

Represent project-only entries with no issue association. Preserve that association when editing hours or comments, and reject creation without an explicit issue before making an HTTP write.
