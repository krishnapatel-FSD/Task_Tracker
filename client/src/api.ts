import type {
  Attachment,
  CompletionNote,
  Employee,
  NotificationPage,
  NotificationPreferences,
  Project,
  ProjectBoardRow,
  ProjectRef,
  Status,
  Task,
  TaskFilterValues,
  TaskInput,
  TaskNote,
  TaskTimeline,
  User,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const SESSION_KEY = 'task-tracker-session';

export interface Session {
  token: string;
  user: User;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---- Session storage -------------------------------------------------------

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable (private mode etc.); the session just won't persist.
  }
}

// Called on any 401 from an authenticated request (expired or invalid token).
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

// ---- Fetch wrapper ---------------------------------------------------------

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = loadSession()?.token;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

// ---- Endpoints -------------------------------------------------------------

export const api = {
  login: (email: string, password: string) =>
    request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  listEmployees: () => request<Employee[]>('/users'),

  listTasks: (filters: Partial<TaskFilterValues> = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
    if (filters.projectId) params.set('projectId', filters.projectId);
    const qs = params.toString();
    return request<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },

  createTask: (input: TaskInput) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),

  updateTask: (id: string, changes: Partial<TaskInput>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),

  deleteTask: (id: string) => request<null>(`/tasks/${id}`, { method: 'DELETE' }),

  restoreTask: (id: string) => request<Task>(`/tasks/${id}/restore`, { method: 'POST' }),

  updateTaskStatus: (id: string, status: Status, note?: CompletionNote) =>
    request<Task>(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...(note ? { note } : {}) }) }),

  listTaskNotes: (id: string) => request<TaskNote[]>(`/tasks/${id}/notes`),

  listTaskEvents: (id: string) => request<TaskTimeline>(`/tasks/${id}/events`),

  listProjects: () => request<ProjectRef[]>('/projects'),

  listProjectBoard: () => request<ProjectBoardRow[]>('/projects?board=true'),

  listAllProjects: () => request<Project[]>('/projects?all=true'),

  createProject: (input: { name: string; description?: string }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),

  updateProject: (id: string, changes: { name?: string; description?: string | null; archived?: boolean }) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),

  listAttachments: (taskId: string) => request<Attachment[]>(`/tasks/${taskId}/attachments`),

  deleteAttachment: (id: string) => request<null>(`/attachments/${id}`, { method: 'DELETE' }),

  listNotifications: (opts: { unread?: boolean; cursor?: string | null; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.unread) params.set('unread', 'true');
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return request<NotificationPage>(`/notifications${qs ? `?${qs}` : ''}`);
  },

  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),

  markNotificationRead: (id: string) => request<null>(`/notifications/${id}/read`, { method: 'POST' }),

  markAllNotificationsRead: () => request<null>('/notifications/read-all', { method: 'POST' }),

  getNotificationPreferences: () => request<NotificationPreferences>('/me/notification-preferences'),

  setNotificationPreferences: (prefs: NotificationPreferences) =>
    request<NotificationPreferences>('/me/notification-preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
};

// ---- Files -------------------------------------------------------------------

/**
 * Uploads one file with progress. Uses XHR because fetch has no upload progress,
 * and sends FormData without the JSON content type the request() wrapper sets.
 */
export function uploadAttachment(taskId: string, file: File, onProgress: (fraction: number) => void): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/tasks/${taskId}/attachments`);
    const token = loadSession()?.token;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as Attachment);
      if (xhr.status === 401 && token) onUnauthorized();
      reject(new ApiError(xhr.status, body?.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, "The upload didn't reach the server. Check your connection."));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/** Downloads need the bearer token, so plain links won't work: fetch a blob and save it. */
export async function downloadAttachment(attachment: Attachment) {
  const token = loadSession()?.token;
  const res = await fetch(`${API_URL}/attachments/${attachment.id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `Download failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- Reports -------------------------------------------------------------------

export type ReportParams = { from: string; to: string; projectId?: string; assigneeId?: string };

function query(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
}

export const reportsApi = {
  get: <T,>(path: string, params: ReportParams & Record<string, string | undefined>) =>
    request<T>(`/reports/${path}?${query(params)}`),
  listWeekly: <T,>() => request<T>('/reports/weekly'),
  getWeekly: <T,>(weekStart: string) => request<T>(`/reports/weekly/${weekStart}`),
  generateWeekly: <T,>(weekStart: string) => request<T>('/reports/weekly', { method: 'POST', body: JSON.stringify({ weekStart }) }),
};

/** Fetches an authenticated file (CSV, attachment) and saves it under the given name. */
export async function downloadFile(path: string, fileName: string) {
  const token = loadSession()?.token;
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `Download failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportCsv(type: 'projects' | 'employees' | 'tasks', params: ReportParams) {
  return downloadFile(`/reports/export.csv?${query({ type, ...params })}`, `${type}-${params.from}-to-${params.to}.csv`);
}
