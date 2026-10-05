---
"@mr-tick/redmine-plugin": patch
---

Return Redmine's canonical stored state after time-entry creation and confirm updates by their ID immediately after a successful PUT. Read updated canonical state separately through findById so the core can retain confirmed writes and retry only GET after read failures. Reconcile lost create responses by the exact correlation marker, filtering the original user, issue and date window with pagination. Validate the complete comment length before writing and preserve remote HTTP errors. Creation orchestration belongs to the core so the provider does not repeat correlation lookups.

Read complete paginated time-entry snapshots before filtering and sorting by the pull cursor. Reject inconsistent pages instead of acknowledging partial listings. Cover remote ordering, timestamp ties, updates beyond the third page and transient/inconsistent pages through connector E2E tests over loopback HTTP. The standard Redmine API does not implement the SDK optional atomic conditional update guarantee.

Require complete validated snapshots for correlation recovery as well as ordinary pulls. Never conclude absence or uniqueness from a truncated, duplicated or inconsistent page; retain original failures and reject ambiguous correlation matches before remote writes.
