# Opt-in, additive and repeatable analytics dataset for the local Docker matrix.
# Does not delete records or alter the existing base fixture.
entry_count = Integer(ENV.fetch('ANALYTICS_SEED_ENTRIES', '3000'))
issue_count = Integer(ENV.fetch('ANALYTICS_SEED_ISSUES', '600'))
abort 'Entries must be between 100 and 10000' unless (100..10000).cover?(entry_count)
abort 'Issues must be between 100 and 2000' unless (100..2000).cover?(issue_count)

admin = User.find_by(login: 'admin')
role = Role.givable.to_a.find { |candidate| candidate.permissions.include?(:log_time) }
tracker = Tracker.find_by(name: 'Feature')
status = IssueStatus.find_by(name: 'New')
priority = IssuePriority.default
activity = TimeEntryActivity.find_by(name: 'Desenvolvimento')
abort 'Run the base fixture first' if [admin, role, tracker, status, priority, activity].include?(nil)
User.current = admin
Mailer.with_deliveries(false) do
base_date = Date.new(2026, 1, 1)

users = (1..24).map do |number|
  user = User.find_or_initialize_by(login: format('analytics.reader%02d', number))
  if user.new_record?
    user.firstname = 'Analytics'
    user.lastname = format('Reader %02d', number)
    user.mail = format('analytics.reader%02d@example.test', number)
    user.password = 'LocalAnalyticsFixture2026!'
    user.password_confirmation = 'LocalAnalyticsFixture2026!'
    user.status = 1
    user.save!
  end
  user
end

projects = (1..12).map do |number|
  project = Project.find_or_initialize_by(identifier: format('analytics-enterprise-%02d', number))
  if project.new_record?
    project.name = format('Analytics Enterprise %02d', number)
    project.is_public = true
    project.enabled_module_names = ['issue_tracking', 'time_tracking']
    project.tracker_ids = [tracker.id]
    project.save!
  end
  [users.fetch((number - 1) * 2), users.fetch((number - 1) * 2 + 1)].each do |user|
    member = Member.find_or_initialize_by(project_id: project.id, user_id: user.id)
    if member.new_record?
      member.roles = [role]
      member.save!
    end
  end
  project
end

issues = (0...issue_count).map do |index|
  project_index = index % projects.length
  project = projects.fetch(project_index)
  marker = format('[analytics-seed:issue:%04d]', index)
  issue = Issue.find_or_initialize_by(project_id: project.id, subject: marker)
  if issue.new_record?
    issue.tracker = tracker
    issue.status = status
    issue.priority = priority
    issue.author = admin
    issue.assigned_to = users.fetch(project_index * 2 + index % 2)
    issue.description = 'Deterministic analytical fixture; native IDs and repeated timestamps.'
    issue.created_on = (base_date + index % 180).to_time.utc + 36000
    issue.updated_on = issue.created_on
    issue.estimated_hours = 4 + index % 16
    issue.save!
  end
  issue
end

(0...entry_count).each do |index|
  issue = issues.fetch(index % issues.length)
  marker = format('[analytics-seed:entry:%05d]', index)
  next if TimeEntry.where(project_id: issue.project_id, comments: marker).exists?
  # Groups of 60 equal timestamps exercise unstable tie ordering on Redmine 3.4.
  date = base_date + (index / 60) % 180
  entry = TimeEntry.new(project_id: issue.project_id, issue_id: issue.id,
    activity_id: activity.id,
    hours: 0.25 + (index % 16) * 0.25, comments: marker, spent_on: date)
  entry.created_on = date.to_time.utc + 36000
  entry.user_id = issue.assigned_to_id
  entry.updated_on = entry.created_on
  entry.save!
end

puts "[ANALYTICS SEED] profile=enterprise projects=#{projects.length} users=#{users.length} issues=#{issues.length} requested_entries=#{entry_count}"
puts "[ANALYTICS SEED] totals issues=#{Issue.count} entries=#{TimeEntry.count}"
end
