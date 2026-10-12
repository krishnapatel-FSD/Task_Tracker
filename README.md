# Employee Task Tracker

Admins create tasks and assign them to employees; employees see and update only their own tasks.
Specs live in [`docs/`](docs/) (PRD, TRD, backend schema, user flow).

**Stack:** React + TypeScript + Vite (client) · Node + Express + TypeScript (server) · PostgreSQL + Drizzle ORM · JWT auth · zod validation.

## Prerequisites

- Node.js 20+
- Docker Desktop (runs PostgreSQL)

## Setup

```bash
npm install
npm run install:all
cp server/.env.example server/.env     # then set JWT_SECRET to a long random string
cp client/.env.example client/.env
npm run db:up        # Postgres on localhost:5440
npm run db:migrate   # create tables
npm run db:seed      # admin + 3 employees + sample tasks
npm run dev          # API on :4000, app on http://localhost:5173
```

## Seeded accounts

All use the password `password123`.

| Email | Role |
| --- | --- |
| admin@example.com | Admin |
| asha@example.com | Employee |
| ben@example.com | Employee |
| chen@example.com | Employee |

## Scripts (from the repo root)

| Script | What it does |
| --- | --- |
| `npm run dev` | Server and client together, with reload |
| `npm test` | API tests (needs the DB running and seeded) |
| `npm run build` | Typecheck and build server and client |
| `npm run db:generate` | New migration after changing `server/src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed accounts (safe to re-run) |
| `npm run db:down` | Stop Postgres |

## Project layout

```
server/src/
  db/           schema.ts, index.ts (Drizzle + pg), seed.ts, migrations/
  lib/          env, HttpError, JWT helpers
  validation/   zod schemas
  services/     business logic: authService, userService, taskService
  middleware/   authenticate, requireRole, validate, errorHandler
  routes/       auth, users, tasks
  app.ts        Express app: /api routing, CORS, error handling
server/test/    API tests (node:test)
client/src/
  api.ts        fetch wrapper (adds token, handles 401)
  auth/         AuthContext, ProtectedRoute
  pages/        Login, AdminTasks, EmployeeTasks
  components/   TaskList, TaskFilters, CreateTaskForm, AppHeader
```

## API

All under `/api`; errors are `{ "error": "message" }`.

| Method & path | Access | Purpose |
| --- | --- | --- |
| `POST /auth/login` | Public | `{ email, password }` → `{ token, user }` |
| `GET /users` | Admin | Employees `{ id, name }` |
| `GET /tasks?status=&assigneeId=` | Logged in | Admin: all tasks; employee: own tasks only |
| `POST /tasks` | Admin | Create task (starts as `todo`) |
| `PATCH /tasks/:id/status` | Admin or assignee | `{ status }` |

## Notes

- Employee scoping is enforced on the server; frontend route guards only choose the screen.
- Past deadlines are accepted on creation (PRD open question, left permissive).
- Passwords are hashed with `bcryptjs` (pure JS, same hash format as `bcrypt`) to avoid native build steps.
