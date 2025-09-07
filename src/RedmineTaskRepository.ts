import { ITaskRepository, Task } from '@timelapse/sdk'

export class RedmineTaskRepository implements ITaskRepository {
  create(entity: Task): Promise<void> {
    throw new Error('Method create RedmineTaskRepository not implemented.')
  }

  update(entity: Task): Promise<void> {
    throw new Error('Method update RedmineTaskRepository not implemented.')
  }

  delete(id: string): Promise<void> {
    throw new Error('Method delete RedmineTaskRepository not implemented.')
  }

  findById(id: string): Promise<Task | undefined> {
    throw new Error('Method findById RedmineTaskRepository not implemented.')
  }
}
