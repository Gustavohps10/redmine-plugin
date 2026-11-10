import {
  AnalyticsDatasetQueryInput,
  AnalyticsFilterValue,
  AppError,
  Either,
} from '@mr-tick/sdk'

function isIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  if (!Number.isFinite(Date.parse(value))) return false

  return new Date(value).toISOString().slice(0, 10) === value
}

export function formatRedmineMultiValueParam(
  value: AnalyticsFilterValue | undefined,
): string | undefined {
  if (value === undefined || value === 'all') return undefined
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.trim()

  if (Array.isArray(value)) {
    if (value.length === 0) return undefined
    if (value.length === 1) return value.join('')

    return `=${value.join('|')}`
  }

  return undefined
}

/** Native identifiers never trigger a display-name discovery scan. */
export function redmineParams(
  input: AnalyticsDatasetQueryInput,
  allowed: readonly string[],
  dateField?: string,
): Either<AppError, Record<string, string>> {
  const params: Record<string, string> = {}

  if (
    dateField === undefined &&
    (input.startDate !== undefined || input.endDate !== undefined)
  )
    return Either.failure(
      AppError.ValidationError('ANALYTICS_DATE_SELECTION_NOT_SUPPORTED'),
    )

  if (input.projectId !== undefined && input.projectId !== 'all') {
    if (!allowed.includes('project_id'))
      return Either.failure(
        AppError.ValidationError('ANALYTICS_PROJECT_SELECTION_NOT_SUPPORTED'),
      )

    if (!/^\d+$/.test(input.projectId))
      return Either.failure(
        AppError.ValidationError('ANALYTICS_NATIVE_PROJECT_ID_REQUIRED'),
      )

    params.project_id = input.projectId
  }

  if (input.filters !== undefined) {
    for (const [name, value] of Object.entries(input.filters)) {
      if (name === 'closed_date_range' || name === 'updated_date_range') {
        if (dateField !== 'created_on')
          return Either.failure(
            AppError.ValidationError('ANALYTICS_FILTER_NOT_SUPPORTED'),
          )

        let field = 'closed_on'
        if (name === 'updated_date_range') field = 'updated_on'

        if (typeof value !== 'object' || Array.isArray(value))
          return Either.failure(
            AppError.ValidationError('ANALYTICS_DATE_FILTER_INVALID'),
          )

        const range = rangeParam(value.from, value.to)
        if (range.isFailure()) return range.forwardFailure()
        if (range.success !== undefined) params[field] = range.success
        continue
      }

      if (!allowed.includes(name))
        return Either.failure(
          AppError.ValidationError('ANALYTICS_FILTER_NOT_SUPPORTED'),
        )

      const formatted = formatRedmineMultiValueParam(value)

      if (formatted === undefined) {
        if (value === 'all' || (Array.isArray(value) && value.length === 0))
          continue

        return Either.failure(
          AppError.ValidationError('ANALYTICS_NATIVE_FILTER_ID_REQUIRED'),
        )
      }

      let valid = /^=?\d+(?:\|\d+)*$/.test(formatted)
      if (
        (name === 'user_id' || name === 'assigned_to_id') &&
        formatted === 'me'
      )
        valid = true
      if (name === 'status_id' && ['*', 'o', 'c'].includes(formatted))
        valid = true

      if (!valid)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_NATIVE_FILTER_ID_REQUIRED'),
        )

      if (
        name === 'project_id' &&
        params.project_id !== undefined &&
        params.project_id !== formatted
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_PROJECT_SCOPE_CONFLICT'),
        )

      params[name] = formatted
    }
  }

  if (dateField !== undefined) {
    const range = rangeParam(input.startDate, input.endDate)
    if (range.isFailure()) return range.forwardFailure()
    if (range.success !== undefined) params[dateField] = range.success
  }

  return Either.success(params)
}

export function normalizeRedmineCheckpoint(
  checkpoint: string,
): Either<AppError, string> {
  const trimmed = checkpoint.trim()
  if (trimmed === '')
    return Either.failure(
      AppError.ValidationError('ANALYTICS_CHANGES_CHECKPOINT_INVALID'),
    )

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    if (!isIsoDateOnly(trimmed))
      return Either.failure(
        AppError.ValidationError('ANALYTICS_CHANGES_CHECKPOINT_INVALID'),
      )

    return Either.success(trimmed)
  }

  const parsedMs = Date.parse(trimmed)
  if (!Number.isFinite(parsedMs))
    return Either.failure(
      AppError.ValidationError('ANALYTICS_CHANGES_CHECKPOINT_INVALID'),
    )

  return Either.success(`${new Date(parsedMs).toISOString().slice(0, 19)}Z`)
}

export function resolveRedmineChangesUpdatedOn(
  checkpoint: string,
  updatedRangeParam: string | undefined,
): Either<AppError, { emptyIntersection: boolean; updatedOn: string }> {
  const normalizedResult = normalizeRedmineCheckpoint(checkpoint)
  if (normalizedResult.isFailure()) return normalizedResult.forwardFailure()

  const normalizedCheckpoint = normalizedResult.success
  const checkpointDay = normalizedCheckpoint.slice(0, 10)
  let rangeFrom: string | undefined
  let rangeTo: string | undefined

  if (updatedRangeParam !== undefined) {
    if (updatedRangeParam.startsWith('><')) {
      const [fromPart, toPart] = updatedRangeParam.slice(2).split('|')
      rangeFrom = fromPart
      rangeTo = toPart
    }

    if (updatedRangeParam.startsWith('>='))
      rangeFrom = updatedRangeParam.slice(2)

    if (updatedRangeParam.startsWith('<=')) rangeTo = updatedRangeParam.slice(2)
  }

  if (rangeTo !== undefined && checkpointDay > rangeTo)
    return Either.success({ emptyIntersection: true, updatedOn: '' })

  let lowerBound = normalizedCheckpoint
  if (rangeFrom !== undefined && rangeFrom > checkpointDay)
    lowerBound = rangeFrom

  if (rangeTo !== undefined)
    return Either.success({
      emptyIntersection: false,
      updatedOn: `><${lowerBound}|${rangeTo}`,
    })

  return Either.success({
    emptyIntersection: false,
    updatedOn: `>=${lowerBound}`,
  })
}

function rangeParam(
  start: string | undefined,
  end: string | undefined,
): Either<AppError, string | undefined> {
  for (const value of [start, end]) {
    if (value !== undefined && !isIsoDateOnly(value))
      return Either.failure(
        AppError.ValidationError('ANALYTICS_DATE_FILTER_INVALID'),
      )
  }

  if (start !== undefined && end !== undefined) {
    if (start > end)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_DATE_RANGE_INVALID'),
      )

    return Either.success(`><${start}|${end}`)
  }

  if (start !== undefined) return Either.success(`>=${start}`)
  if (end !== undefined) return Either.success(`<=${end}`)

  return Either.success(undefined)
}

export function requiredNativeId(
  params: Record<string, string>,
  field: string,
): Either<AppError, string> {
  const value = params[field]
  if (value === undefined || !/^\d+$/.test(value))
    return Either.failure(
      AppError.ValidationError(`ANALYTICS_${field.toUpperCase()}_REQUIRED`),
    )

  return Either.success(value)
}
