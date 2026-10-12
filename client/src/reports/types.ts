export interface Metrics {
  open: number;
  overdue: number;
  created: number;
  completed: number;
  onTimeRate: number | null;
  avgCycleDays: number | null;
}

export interface Summary {
  range: { from: string; to: string; measuredOn: string; previousFrom: string; previousTo: string };
  current: Metrics;
  previous: Metrics;
  timeInProgress: { avgDays: number | null; sample: number; historySince: string | null };
}

export interface ThroughputWeek {
  weekStart: string;
  created: number;
  completed: number;
  completedOnTime: number;
}

export interface StatusRow {
  id: string;
  label: string;
  colourIndex: number | null;
  overdue: number;
  inProgress: number;
  todo: number;
  done: number;
}

export interface ProjectRow extends Metrics {
  id: string;
  name: string;
  colourIndex: number;
  archived: boolean;
}

export interface EmployeeRow extends Metrics {
  id: string;
  name: string;
  workload: { high: number; medium: number; low: number };
}

export interface OverdueRow {
  id: string;
  title: string;
  deadline: string;
  daysLate: number;
  assigneeId: string;
  assigneeName: string;
  projectId: string;
  projectName: string;
}

export interface ActivityRow {
  id: string;
  type: string;
  data: Record<string, any>;
  createdAt: string;
  actorName: string;
  taskId: string;
  taskTitle: string;
}
