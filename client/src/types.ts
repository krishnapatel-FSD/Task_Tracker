export type Role = 'admin' | 'employee';
export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'in_progress' | 'done';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface Employee {
  id: string;
  name: string;
}

export interface ProjectRef {
  id: string;
  name: string;
  colourIndex: number;
}

/** One card on the projects home. Counts cover live tasks the viewer can see. */
export interface ProjectBoardRow extends ProjectRef {
  description: string | null;
  totalTasks: number;
  openTasks: number;
  lateTasks: number;
  dueToday: number;
  doneTasks: number;
  nextDeadline: string | null;
  changedTasks: number;
}

/** A project as the admin projects page sees it. */
export interface Project extends ProjectRef {
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  openTasks: number;
  totalTasks: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  deadline: string; // YYYY-MM-DD
  status: Status;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignee: Employee;
  project: ProjectRef;
  attachmentCount: number;
  noteCount: number;
  commentCount: number;
}

/** Anyone who can be @mentioned. */
export interface Person {
  id: string;
  name: string;
  role: Role;
}

export interface TaskComment {
  id: string;
  /** Null once deleted: the comment stays as a placeholder. */
  body: string | null;
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  author: Employee;
  mentions: Employee[];
  revisionCount: number;
}

export interface CommentRevision {
  id: string;
  body: string;
  createdAt: string;
  editor: Employee;
}

/** What was done and how long it took. Required when a task is marked done. */
export interface CompletionNote {
  summary: string;
  minutesSpent: number;
}

export interface TaskNote extends CompletionNote {
  id: string;
  createdAt: string;
  author: Employee;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader: Employee;
}

/** Fields an admin can set when creating or editing a task. */
export interface TaskInput {
  title: string;
  description: string;
  assigneeId: string;
  projectId: string;
  priority: Priority;
  deadline: string;
}

export type TaskEventType =
  | 'created'
  | 'updated'
  | 'reassigned'
  | 'status_changed'
  | 'archived'
  | 'restored'
  | 'attachment_added'
  | 'attachment_removed';

export interface TaskEvent {
  id: string;
  type: TaskEventType;
  data: Record<string, any>;
  createdAt: string;
  actor: Employee;
}

export interface TaskTimeline {
  events: TaskEvent[];
  /** id -> display name for people and projects mentioned in the events */
  names: Record<string, string>;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  emailFrequency: 'instant' | 'daily';
}

export interface TaskFilterValues {
  status: Status | '';
  assigneeId: string;
  projectId: string;
}

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const STATUSES = Object.keys(STATUS_LABELS) as Status[];
export const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
