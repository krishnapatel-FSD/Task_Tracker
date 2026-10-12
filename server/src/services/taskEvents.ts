import type { Tx } from '../db/index.js';
import { taskEvents, type TaskEventType } from '../db/schema.js';

export interface NewTaskEvent {
  taskId: string;
  actorId: string;
  type: TaskEventType;
  data?: Record<string, unknown>;
}

export type TaskEventRow = typeof taskEvents.$inferSelect;

type EventListener = (tx: Tx, event: TaskEventRow) => Promise<void>;
const listeners: EventListener[] = [];

/** Lets other modules (notifications) react to events inside the same transaction. */
export function onTaskEvent(listener: EventListener) {
  listeners.push(listener);
}

/** Writes one activity-log row. Always called inside the transaction that made the change. */
export async function recordEvent(tx: Tx, e: NewTaskEvent): Promise<TaskEventRow> {
  const [event] = await tx
    .insert(taskEvents)
    .values({ taskId: e.taskId, actorId: e.actorId, type: e.type, data: e.data ?? {} })
    .returning();
  for (const listener of listeners) {
    await listener(tx, event);
  }
  return event;
}
