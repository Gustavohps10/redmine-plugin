import {
  AppError,
  createTimeEntrySnapshotPage,
  TimeEntryPullCheckpointDTO,
  TimeEntryPullPageDTO,
  CreatedTimeEntryResult,
  Either,
  ITimeEntryProvider,
  PagedResultDTO,
  PaginationOptionsDTO,
  TimeEntryCreateIdempotency,
  TimeEntryDTO,
  UpdatedTimeEntryResult,
} from "@mr-tick/sdk";

import { RedmineClient } from "../../../client/RedmineClient";
import {
  RedmineCreateTimeEntryPayload,
  RedmineTimeEntryAPI,
  RedmineUpdateTimeEntryPayload,
} from "../../../types/redmine";

function formatLocalDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCorrelationId(comments?: string): string | undefined {
  if (!comments) return undefined;
  const marker = comments.match(/\[mc:([^\]]+)\]/);
  if (!marker) return undefined;
  return marker[1];
}

function stripCorrelationMarker(comments?: string): string | undefined {
  if (!comments) return undefined;
  const cleanComments = comments.replace(/\s*\[mc:[^\]]+\]\s*/g, " ").trim();
  if (!cleanComments) return undefined;
  return cleanComments;
}

function addCorrelationMarker(
  comments: string | undefined,
  correlationId: string | undefined,
): string | undefined {
  if (!correlationId) return comments;
  const cleanComments = stripCorrelationMarker(comments);
  if (!cleanComments) return `[mc:${correlationId}]`;
  return `${cleanComments} [mc:${correlationId}]`;
}

export class RedmineTimeEntryProvider implements ITimeEntryProvider {
  public readonly timeEntryCreateIdempotency: TimeEntryCreateIdempotency =
    "reconcilable";

  constructor(private readonly client: RedmineClient) {}

  public async pull(
    memberId: string,
    checkpoint: TimeEntryPullCheckpointDTO,
    batch: number,
  ): Promise<Either<AppError, TimeEntryPullPageDTO>> {
    if (!Number.isInteger(batch) || batch <= 0)
      return Either.failure(AppError.ValidationError("TIME_ENTRY_BATCH_INVALID"));
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setMonth(toDate.getMonth() - 2);
    const params: Record<string, string> = {
      from: formatLocalDateYMD(fromDate), to: formatLocalDateYMD(toDate),
    };
    if (memberId) params.user_id = memberId;
    const result = await this.readCompleteSnapshot(params);
    if (result.isFailure()) return result.forwardFailure();
    return createTimeEntrySnapshotPage(result.success, checkpoint, batch, memberId);
  }
  public async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    const result = await this.readCompleteSnapshot({
      user_id: memberId,
      from: formatLocalDateYMD(startDate),
      to: formatLocalDateYMD(endDate),
    });
    if (result.isFailure()) return result.forwardFailure();
    const items = result.success;
    return Either.success({
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    });
  }

  private async readCompleteSnapshot(
    filters: Record<string, string>,
  ): Promise<Either<AppError, TimeEntryDTO[]>> {
    const entries: TimeEntryDTO[] = [];
    const ids = new Set<number>();
    let offset = 0;
    let expectedTotal: number | undefined;
    while (true) {
      const result = await this.client.listTimeEntries({
        ...filters,
        limit: "100",
        offset: String(offset),
      });
      if (result.isFailure()) return result.forwardFailure();
      const page = result.success;
      if (
        !Number.isInteger(page.total_count) ||
        page.total_count < 0 ||
        page.offset !== offset ||
        !Number.isInteger(page.limit) ||
        page.limit <= 0 ||
        page.time_entries.length > page.limit ||
        (expectedTotal !== undefined && page.total_count !== expectedTotal)
      )
        return Either.failure(AppError.Http(503, "REDMINE_TIME_ENTRY_SNAPSHOT_INCONSISTENT"));
      const totalCount = page.total_count;
      expectedTotal = totalCount;
      for (const entry of page.time_entries) {
        if (
          !Number.isInteger(entry.id) ||
          entry.id <= 0 ||
          ids.has(entry.id) ||
          !Number.isFinite(new Date(entry.updated_on).getTime())
        )
          return Either.failure(AppError.Http(503, "REDMINE_TIME_ENTRY_SNAPSHOT_INCONSISTENT"));
        ids.add(entry.id);
        entries.push(this.mapTimeEntryToDTO(entry));
      }
      offset += page.time_entries.length;
      if (offset === totalCount) return Either.success(entries);
      if (offset > totalCount || page.time_entries.length === 0)
        return Either.failure(AppError.Http(503, "REDMINE_TIME_ENTRY_SNAPSHOT_INCOMPLETE"));
    }
  }

  public async findById(
    id: string,
  ): Promise<Either<AppError, TimeEntryDTO | null>> {
    if (!/^\d+$/.test(id))
      return Either.failure(
        AppError.ValidationError("REDMINE_TIME_ENTRY_ID_INVALID"),
      );

    const result = await this.client.getTimeEntryById(id);
    if (result.isFailure()) {
      if (result.failure.statusCode === 404) return Either.success(null);
      return result.forwardFailure();
    }

    const entry = result.success.time_entry;
    const dto = this.mapTimeEntryToDTO(entry);
    return Either.success(dto);
  }

  public async findByCorrelation(
    correlationId: string,
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, TimeEntryDTO | null>> {
    const centerDate = entry.startDate
      ? new Date(entry.startDate)
      : new Date(entry.createdAt);
    const fromDate = new Date(centerDate);
    fromDate.setDate(fromDate.getDate() - 1);
    const toDate = new Date(centerDate);
    toDate.setDate(toDate.getDate() + 1);

    const result = await this.readCompleteSnapshot({
      user_id: entry.user.id,
      issue_id: entry.task.id,
      from: formatLocalDateYMD(fromDate),
      to: formatLocalDateYMD(toDate),
    });
    if (result.isFailure()) return result.forwardFailure();
    const matches = result.success.filter(
      (remoteEntry: TimeEntryDTO) => remoteEntry.correlationId === correlationId,
    );
    if (matches.length > 1)
      return Either.failure(AppError.ValidationError("DUPLICATE_TIME_ENTRY_CORRELATION"));
    if (matches.length === 0) return Either.success(null);
    return Either.success(matches[0]);
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    const page = pagination?.page ? pagination.page : 1;
    const pageSize = pagination?.pageSize ? pagination.pageSize : 25;
    const offset = (page - 1) * pageSize;

    const params: Record<string, string> = {
      limit: String(pageSize),
      offset: String(offset),
    };

    const result = await this.client.listTimeEntries(params);
    if (result.isFailure()) return result.forwardFailure();

    const entries = result.success.time_entries;
    const items = entries.map((entry: RedmineTimeEntryAPI) =>
      this.mapTimeEntryToDTO(entry),
    );

    return Either.success({
      items,
      total: result.success.total_count,
      page,
      pageSize,
    });
  }

  public async create(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, CreatedTimeEntryResult>> {
    if (!/^[1-9]\d*$/.test(entry.task.id))
      return Either.failure(AppError.ValidationError("REDMINE_ISSUE_ID_REQUIRED"));

    const spentOn = entry.startDate
      ? formatLocalDateYMD(entry.startDate)
      : formatLocalDateYMD(entry.createdAt);

    if (entry.task.id && !/^[1-9]\d*$/.test(entry.task.id))
      return Either.failure(AppError.ValidationError("REDMINE_ISSUE_ID_INVALID"));

    const comments = addCorrelationMarker(entry.comments, entry.correlationId);
    if (comments && [...comments].length > 1024)
      return Either.failure(AppError.ValidationError("REDMINE_TIME_ENTRY_COMMENTS_TOO_LONG"));
    const payload: RedmineCreateTimeEntryPayload = {
      time_entry: {
        issue_id: Number(entry.task.id),
        activity_id: Number(entry.activity.id),
        hours: entry.timeSpent,
        comments: comments ? comments : "",
        spent_on: spentOn,
      },
    };

    if (entry.user && entry.user.id) {
      payload.time_entry.user_id = Number(entry.user.id);
    }

    const result = await this.client.createTimeEntry(payload);
    if (result.isFailure()) return result.forwardFailure();

    return Either.success({
      id: String(result.success.time_entry.id),
      updatedAt: new Date(result.success.time_entry.updated_on),
      entry: this.mapTimeEntryToDTO(result.success.time_entry),
    });
  }

  public async update(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>> {
    if (!entry.id)
      return Either.failure(
        AppError.ValidationError(
          "ID do apontamento obrigatório para atualização",
        ),
      );

    if (!/^\d+$/.test(entry.id))
      return Either.failure(
        AppError.ValidationError("REDMINE_TIME_ENTRY_ID_INVALID"),
      );

    if (entry.task.id && !/^[1-9]\d*$/.test(entry.task.id))
      return Either.failure(AppError.ValidationError("REDMINE_ISSUE_ID_INVALID"));

    const comments = addCorrelationMarker(entry.comments, entry.correlationId);
    if (comments && [...comments].length > 1024)
      return Either.failure(AppError.ValidationError("REDMINE_TIME_ENTRY_COMMENTS_TOO_LONG"));
    const payload: RedmineUpdateTimeEntryPayload = {
      time_entry: {
        issue_id: entry.task?.id ? Number(entry.task.id) : undefined,
        activity_id: entry.activity?.id ? Number(entry.activity.id) : undefined,
        hours: entry.timeSpent,
        comments: comments ? comments : "",
        spent_on: entry.startDate
          ? formatLocalDateYMD(entry.startDate)
          : undefined,
      },
    };

    const result = await this.client.updateTimeEntry(entry.id, payload);
    if (result.isFailure()) return result.forwardFailure();

    return Either.success({ id: entry.id });
  }

  public async delete(id: string): Promise<Either<AppError, void>> {
    if (!/^\d+$/.test(id))
      return Either.failure(
        AppError.ValidationError("REDMINE_TIME_ENTRY_ID_INVALID"),
      );

    const result = await this.client.deleteTimeEntry(id);
    if (result.isFailure()) return result.forwardFailure();
    return Either.success(undefined);
  }

  private mapTimeEntryToDTO(entry: RedmineTimeEntryAPI): TimeEntryDTO {
    const hours = Number(entry.hours) || 0;

    const dateParts = entry.spent_on.split("-").map(Number);
    const year = dateParts[0] ? dateParts[0] : 1970;
    const month = dateParts[1] ? dateParts[1] : 1;
    const day = dateParts[2] ? dateParts[2] : 1;

    const startDate = new Date(year, month - 1, day, 12, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + hours * 3600 * 1000);

    const taskId = entry.issue
      ? String(entry.issue.id)
      : "";

    const correlationId = getCorrelationId(entry.comments);

    return {
      id: String(entry.id),
      correlationId,
      task: {
        id: taskId,
      },
      activity: {
        id: String(entry.activity.id),
        name: entry.activity.name,
      },
      user: {
        id: String(entry.user.id),
        name: entry.user.name,
      },
      startDate,
      endDate,
      timeSpent: hours,
      comments: stripCorrelationMarker(entry.comments),
      createdAt: new Date(entry.created_on),
      updatedAt: new Date(entry.updated_on),
      source: "addon",
    };
  }
}
