# Employee Task Tracker

Admins create tasks in projects and assign them to employees; employees see and update only their own tasks.
Phase 2 adds editing, delete with Undo, an activity log, notifications (in-app and email), file attachments, admin reports with charts, and a weekly report.

Specs live in [`docs/`](docs/): PRD, TRD, backend schema, user flow, and the [Phase 2 plan](docs/Task%20Tracker%20Phase%202%20Plan.md). The visual system is in [DESIGN.md](DESIGN.md).

**Stack:** React + TypeScript + Vite (client) · Node + Express + TypeScript (server) · PostgreSQL + Drizzle ORM · JWT auth · zod validation · Recharts (reports) · node-cron + nodemailer (jobs and email) · multer + file-type (uploads).

## Prerequisites

- Node.js 20+
- Docker Desktop (runs PostgreSQL and Mailpit)

## Setup

```bash
npm install
npm run install:all
cp server/.env.example server/.env     # then set JWT_SECRET to a long random string
cp client/.env.example client/.env
npm run db:up        # Postgres on localhost:5440, Mailpit on localhost:8025
npm run db:migrate   # create tables
npm run db:seed      # admin, 5 employees, 3 projects, 8 weeks of sample history
npm run dev          # API on :4000, app on http://localhost:5173
```

All email goes to Mailpit locally: open http://localhost:8025 to read it. Leave `SMTP_URL` empty to turn email off.

## Seeded accounts

All use the password `password123`.

| Email | Role |
| --- | --- |
| admin@example.com | Admin |
| asha@example.com, ben@example.com, chen@example.com, rohan@example.com, sara@example.com | Employee |

## Scripts (from the repo root)

| Script | What it does |
| --- | --- |
| `npm run dev` | Server and client together, with reload. The server also runs the scheduled jobs. |
| `npm test` | API tests (needs the DB running and seeded). Test files run one at a time. |
| `npm run build` | Typecheck and build server and client |
| `npm run db:generate` | New migration after changing `server/src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed accounts, and sample data if the database has no tasks (safe to re-run) |
| `npm run db:reset` | Wipe tasks, projects and history, then seed fresh sample data |
| `npm run db:down` | Stop Postgres and Mailpit |
| `npm run report:weekly --prefix server` | Run the Monday weekly-report job now |

## Configuration (`server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL`, `JWT_SECRET`, `PORT` | | Required database and auth settings |
| `CLIENT_ORIGIN`, `APP_URL` | `http://localhost:5173` | CORS origin; base URL for links in emails |
| `REPORT_TZ` | `Asia/Kolkata` | Time zone for "today", reminders and report weeks |
| `SMTP_URL`, `MAIL_FROM` | empty | Email transport; empty turns email off |
| `JOBS_ENABLED` | `true` | Run scheduled jobs in this process |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | `uploads`, `10` | Attachment storage folder and size limit |

## Scheduled jobs

Started from `server/src/index.ts` (never from `app.ts`, so tests don't run them). Each takes a Postgres advisory lock, so two server instances never double-send.

| Job | When (REPORT_TZ) | What |
| --- | --- | --- |
| Email outbox | every 30 s | Sends instant emails for new notifications; failures retry on the next tick |
| Due reminders | daily 09:00 | One "due tomorrow" and one "overdue" digest per person (idempotent per day) |
| Daily email digest | daily 09:05 | One summary email for people who chose a daily digest |
| Weekly report | Mondays 08:00 | Snapshot of last week, in-app notice and email with CSV to admins |
| File cleanup | daily 03:30 | Deletes the bytes of attachments removed more than a day ago |

## Project layout

```
server/src/
  db/           schema.ts, index.ts (Drizzle + pg), seed.ts, migrations/
  lib/          env, errors, JWT, dates, mailer, storage, advisory locks
  validation/   zod schemas
  services/     auth, user, project, task, taskEvents (activity log), notification,
                attachment, report (metric definitions), weeklyReport
  jobs/         scheduler, due reminders, email outbox
  middleware/   authenticate, requireRole, validate, errorHandler
  routes/       auth, users, projects, tasks, attachments, notifications, reports
  app.ts        Express app: /api routing, CORS, error handling
server/test/    API tests (node:test): api, notifications, attachments, reports
client/src/
  api.ts        fetch wrapper (token, 401), upload with progress, authenticated downloads
  auth/         AuthContext, ProtectedRoute
  pages/        Login, AdminTasks, EmployeeTasks, AdminProjects, NotificationsPage
  components/   Timetable (rows, Details/Activity/Files tabs), TaskComposer (create/edit),
                TaskFilters, Activity, Files, NotificationBell, EmailSettings, Toast, AppHeader
  reports/      ReportsPage (lazy-loaded), charts, tables, WeeklyTab
```

## API

All under `/api`; errors are `{ "error": "message" }`. Archived (deleted) tasks are 404 everywhere except restore.

| Method & path | Access | Purpose |
| --- | --- | --- |
| `POST /auth/login` | Public | `{ email, password }` → `{ token, user }` |
| `GET /users` | Admin | Employees `{ id, name }` |
| `GET /projects` | Logged in | Active projects; `?all=true` (admin) adds archived ones and task counts |
| `POST /projects`, `PATCH /projects/:id` | Admin | Create; rename, describe, archive or restore |
| `GET /tasks?status=&assigneeId=&projectId=` | Logged in | Admin: all tasks; employee: own tasks only |
| `POST /tasks` | Admin | Create task (starts as `todo`) |
| `PATCH /tasks/:id` | Admin | Edit title, description, priority, deadline, project, assignee (only changed fields are logged) |
| `PATCH /tasks/:id/status` | Admin or assignee | `{ status }` |
| `DELETE /tasks/:id`, `POST /tasks/:id/restore` | Admin | Soft delete; restore powers Undo |
| `GET /tasks/:id/events` | Admin or assignee | Activity timeline with names resolved |
| `GET /tasks/:id/attachments`, `POST /tasks/:id/attachments` | Admin or assignee | List; upload one file (`multipart/form-data`, field `file`) |
| `GET /attachments/:id/download` | Admin or assignee | Always a download, `nosniff` |
| `DELETE /attachments/:id` | Uploader or admin | Remove a file |
| `GET /notifications`, `GET /notifications/unread-count` | Logged in | Own notifications (cursor paging) and unread count |
| `POST /notifications/:id/read`, `POST /notifications/read-all` | Logged in | Mark read |
| `GET`/`PUT /me/notification-preferences` | Logged in | Email on/off, instant or daily |
| `GET /reports/{summary,throughput,status-breakdown,projects,employees,overdue,activity}` | Admin | Report data; `from`, `to`, optional `projectId`, `assigneeId` |
| `GET /reports/export.csv?type=projects\|employees\|tasks` | Admin | CSV of the same data |
| `GET /reports/weekly`, `GET /reports/weekly/:weekStart(/export.csv)` | Admin | Saved weekly snapshots |
| `POST /reports/weekly` | Admin | Generate or regenerate one week, `{ weekStart }` (a Monday) |

## Notes

- Employee scoping is enforced on the server; frontend route guards only choose the screen.
- Every task change writes its activity-log event and notifications in the same transaction.
- A delete's notification is held for the Undo window and dropped if the task is restored.
- Report metrics are defined once, in `server/src/services/reportService.ts`, and shared by the charts, CSVs and weekly report.
- Uploads are checked by extension and by their actual bytes; files are never served statically.
- Passwords are hashed with `bcryptjs` (pure JS, same hash format as `bcrypt`) to avoid native build steps.
