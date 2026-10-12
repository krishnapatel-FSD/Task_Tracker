# Employee Task Tracker: TRD

Oct 12, 2026 · @KRISHNA

## 1. Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| ORM and migrations | Drizzle ORM, drizzle-kit, node-postgres (pg) |
| Auth | JWT (jsonwebtoken), password hashing with bcrypt |
| Validation | zod |

No state library and no UI framework are needed. The frontend uses React state, one auth context and the browser fetch API.

## 2. Architecture

Three tiers. The React single-page app calls the Express REST API with JSON over HTTP. The API reads and writes PostgreSQL through Drizzle.

Every request after login passes two middlewares in order: authenticate (verify the JWT) and requireRole (only where a route is restricted).

## 3. Project structure

```
task-tracker/
  server/
    src/
      db/
        schema.ts        Drizzle tables and enums
        index.ts         Drizzle + pg connection
        seed.ts          creates admin and sample employees
      middleware/
        authenticate.ts  verifies JWT, sets req.user
        requireRole.ts   checks req.user.role
      routes/
        auth.ts          POST /api/auth/login
        users.ts         GET /api/users
        tasks.ts         task endpoints
      app.ts
      index.ts
    drizzle.config.ts
  client/
    src/
      pages/             Login, AdminTasks, EmployeeTasks
      components/        TaskList, TaskFilters, CreateTaskForm
      auth/              AuthContext, ProtectedRoute
      api.ts             fetch wrapper that adds the token
```

## 4. Authentication and authorization

- Login checks the email, compares the password with bcrypt, then signs a JWT with payload sub (user id) and role. Expiry: 8 hours.
- The client stores the token and user in localStorage and sends an Authorization: Bearer header on every request.
- authenticate rejects missing or invalid tokens with 401.
- requireRole('admin') rejects other roles with 403.
- Employee scoping is applied on the server: for employees the task query always adds assignee\_id = caller id. The assignee value is never taken from the client for employees.
- Frontend route guards only decide which screen to show. They are not a security control.

## 5. API

All routes are under /api. Errors use the JSON shape: error (a message string).

| Method and path | Access | Purpose |
| --- | --- | --- |
| POST /auth/login | Public | Body: email, password. Returns token and user (id, name, role). 401 on failure. |
| GET /users | Admin | Returns employees (id, name) for the assignee dropdown and filter. |
| POST /tasks | Admin | Body: title, description, assigneeId, priority, deadline. Creates the task with status todo. Returns 201 and the task. |
| GET /tasks | Any logged-in user | Optional query: status, assigneeId. Admin gets all tasks, employee gets only their own. assigneeId is ignored for employees. |
| PATCH /tasks/:id/status | Admin or the task's assignee | Body: status. Returns the updated task. 403 if an employee is not the assignee, 404 if the task does not exist. |

A task in responses includes: id, title, description, priority, deadline, status, createdAt, and assignee (id, name).

## 6. Task list query

- Start from tasks joined to users on assignee.
- If the caller is an employee: add assignee\_id = caller id.
- If the caller is admin and assigneeId is given: add assignee\_id = assigneeId.
- If status is given: add status = status.
- Order by deadline ascending.

## 7. Validation (zod)

- title: string, 1 to 150 characters
- description: non-empty string
- assigneeId: valid uuid of an existing user with role employee
- priority: low, medium or high
- deadline: valid date (YYYY-MM-DD)
- status: todo, in\_progress or done
- Invalid input returns 400.

## 8. Configuration

Environment variables: DATABASE\_URL, JWT\_SECRET, PORT. The client needs the API base URL.

## 9. Seeding

seed.ts inserts one admin and a few employees with bcrypt-hashed passwords. This is the only way accounts are created.

## 10. Frontend behaviour

- Login page posts credentials, stores the result, then redirects by role: admin to AdminTasks, employee to EmployeeTasks.
- ProtectedRoute redirects to login when there is no token, and to the user's own home when the role does not match.
- AdminTasks: filters for status and assignee, task list, Create task form.
- EmployeeTasks: status filter, own task list, status dropdown per task.
- A 401 response clears the stored session and returns to login.

## 11. Phase 2 additions

- **API**: the full, current endpoint table is in the README. New areas: projects, task edit/delete/restore, task events, attachments, notifications and preferences, reports and weekly reports.
- **Transactions**: every task change writes its activity event and its notifications in one transaction (`services/taskEvents.ts` fans events out to `services/notificationService.ts`).
- **Jobs**: node-cron in `server/src/jobs/`, started from `index.ts` only, each behind a Postgres advisory lock. Email goes out after commit through an outbox, so a mail failure never breaks a request.
- **Files**: multer (memory, 10 MB), extension allowlist plus byte sniffing with `file-type`, random storage keys behind a storage interface (local disk now), downloads only through an authenticated route with `Content-Disposition: attachment` and `nosniff`.
- **Reports**: metric definitions live once in `services/reportService.ts` (SQL aggregates in REPORT_TZ) and feed the charts, CSV exports and the weekly snapshot. CSV cells that look like formulas are prefixed with a quote.
- **Client**: Recharts is lazy-loaded on `/admin/reports` only; report state lives in the URL.
- **New configuration**: `APP_URL`, `REPORT_TZ`, `SMTP_URL`, `MAIL_FROM`, `JOBS_ENABLED`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`.
