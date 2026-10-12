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

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  deadline: string; // YYYY-MM-DD
  status: Status;
  createdAt: string;
  assignee: Employee;
}

export interface TaskFilterValues {
  status: Status | '';
  assigneeId: string;
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
