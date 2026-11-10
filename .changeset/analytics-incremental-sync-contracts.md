---
"@mr-tick/redmine-plugin": minor
---

Implement declarative Phase 3 analytical sync strategies, server-derived issue checkpoints, and canonical date selection mapping across Redmine 3.4, 5.1, and 6.0.

- Declare `modes: ['snapshot', 'changes']` and `changes: { deletions: 'none' }` on `redmine_issues`, computing `checkpoint` exclusively from observed server `updated_date` timestamps, applying inclusive `updated_on >= checkpoint` with deterministic `sort=id:asc` and explicit filter intersection, and failing loudly if `total_count` changes mid-delta.
- Declare `windowRescan: { dateColumn: 'date' }` on `redmine_time_entries` (`spent_on` scope only, never sending ignored `updated_on`/`created_on`), keep all remaining datasets (including `redmine_issue_discovery`) on explicit `snapshot` mode, remove legacy `filters.date_range` in favor of `selection: { dateRange, project }`, remove unused CSV helper code, and run Docker integration tests sequentially via `--no-file-parallelism`.
