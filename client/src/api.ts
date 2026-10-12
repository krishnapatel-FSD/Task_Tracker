import type { Employee, Priority, Status, Task, TaskFilterValues, User } from './types';

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
    const qs = params.toString();
    return request<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },

  createTask: (input: {
    title: string;
    description: string;
    assigneeId: string;
    priority: Priority;
    deadline: string;
  }) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),

  updateTaskStatus: (id: string, status: Status) =>
    request<Task>(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
