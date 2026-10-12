# Employee Task Tracker: Phase 2 Implementation Plan

Oct 12, 2026 · Draft

Scope: edit, delete and reassign tasks; activity log; notifications; attachments; admin reports section with charts (project-wise and employee-wise); weekly report generation.

This plan builds on the MVP as it stands (Express 5 + Drizzle + Postgres, React 19 + Vite, JWT auth, zod). It keeps the existing conventions: business logic in `services/`, zod at the edge, server-side scoping, `{ error }` responses, and the timetable design language in DESIGN.md (no modals, one signal accent).

---

## 1. Decisions this plan assumes

Confirm or change these before starting. Each has a default the plan is written around.

| # | Decision | Default in this plan |
| --- | --- | --- |
| D1 | "Project-wise" needs a project concept, which the MVP does not have | Add a `projects` table. Every task belongs to one project. Existing tasks move into a "General" project. Admins manage projects. |
| D2 | Delete behaviour | Soft delete (`archived_at`), with an 8-second Undo instead of a confirm dialog. Archived tasks are hidden from lists and reports. |
| D3 | Notification channels | In-app (bell in the header) first; email second, behind a config flag. Mailpit in docker-compose for local email. |
| D4 | Live updates | Poll the unread count every 30 s. Server-sent events are a later upgrade, not part of this phase. |
| D5 | Attachment storage | Local disk (`server/uploads/`) behind a storage interface, so S3 or R2 can be added without touching routes. 10 MB per file, 10 files per task. |
| D6 | Who can attach | Admin on any task; employee on their own tasks. People can remove only their own uploads; admins can remove any. |
| D7 | Weekly report | Covers Monday to Sunday. Generated every Monday at 08:00 in `REPORT_TZ` (default `Asia/Kolkata`). Stored as a snapshot, emailed to admins, downloadable as CSV. |
| D8 | Chart library | Recharts, themed with the existing CSS tokens. Employee series reuse the `--line-0..7` colours. |
| D9 | Employee edit rights | Unchanged: employees still change only status (plus attachments). Editing fields, reassigning and deleting stay admin-only. |

---

## 2. Delivery order

The features depend on each other, so the order matters:

```
Phase 0  Foundations (projects, events table, completed_at, archived_at)
   │
   ├─ Phase 1  Edit / delete / reassign  +  Activity log      (writes events)
   │      │
   │      ├─ Phase 2  Notifications                           (fans out from events)
   │      └─ Phase 3  Attachments                             (writes events, notifies)
   │
   └─ Phase 4  Reports API + Admin reports & charts           (reads tasks + events)
          │
          └─ Phase 5  Weekly report generation                (snapshots Phase 4 queries)
```

Rough effort for one developer: about 3 to 4 weeks in total (see section 10).

---

## 3. Phase 0: Foundations

### 3.1 Schema changes (`server/src/db/schema.ts`)

New enum:

```ts
export const taskEventTypeEnum = pgEnum('task_event_type', [
  'created', 'updated', 'reassigned', 'status_changed',
  'archived', 'restored', 'attachment_added', 'attachment_removed',
]);
```

New table `projects`:

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| name | varchar(100) | not null, unique |
| description | text | nullable |
| colour_index | smallint | 0 to 7, reuses the line colours |
| archived_at | timestamptz | nullable |
| created_at | timestamptz | default now |

Changes to `tasks`:

| Column | Change | Why |
| --- | --- | --- |
| project_id | new, uuid, FK to projects, not null after backfill | project-wise filters and reports |
| completed_at | new, timestamptz, nullable | set when status becomes `done`, cleared when it leaves `done`; makes on-time and cycle-time queries cheap |
| archived_at | new, timestamptz, nullable | soft delete |
| archived_by | new, uuid FK users, nullable | audit |
| updated_at | existing | now set on every change, not only status; and returned in the API |

New table `task_events` (the activity log):

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| task_id | uuid | FK tasks, not null |
| actor_id | uuid | FK users, not null |
| type | task_event_type | not null |
| data | jsonb | type-specific payload, see 4.2 |
| created_at | timestamptz | default now |

New indexes: `task_events(task_id, created_at)`, `tasks(project_id)`, `tasks(completed_at)`, partial index `tasks(deadline) where archived_at is null`.

### 3.2 Migration and backfill

One drizzle migration (`npm run db:generate`), followed by a hand-written SQL step in the same migration:

1. Insert a project named "General".
2. Set `project_id` on every existing task to it, then make the column `not null`.
3. For tasks with `status = 'done'`, set `completed_at = updated_at`.
4. Insert one `created` event per existing task (actor = the first admin, `created_at` = task.created_at), so every task has a timeline.

Update `seed.ts`: two or three sample projects, tasks spread across them, and a few historical events so the charts have data on day one.

### 3.3 Service-layer pattern

Every task mutation runs in one transaction that (a) changes the task, (b) inserts its event or events, and (c) queues its notifications (Phase 2). Add a small helper:

```ts
// services/taskEvents.ts
export async function recordEvent(tx: Tx, e: { taskId; actorId; type; data? }) { ... }
```

`AuthUser` currently has only `id` and `role`, which is enough: the actor is always `req.user.id`.

### 3.4 Projects API (admin)

| Method and path | Access | Purpose |
| --- | --- | --- |
| GET /projects | Logged in | Active projects `{ id, name, colourIndex }` (employees need names to display) |
| POST /projects | Admin | Create |
| PATCH /projects/:id | Admin | Rename, describe, archive |

Client changes: a project select in the composer, a project filter next to status and assignee, and a project chip in each timetable row. A minimal `/admin/projects` page (list + inline create/rename). `GET /tasks` gets an optional `projectId` filter.

---

## 4. Phase 1: Edit, delete, reassign + activity log

### 4.1 API

| Method and path | Access | Purpose |
| --- | --- | --- |
| PATCH /tasks/:id | Admin | Partial update of title, description, priority, deadline, projectId, assigneeId. Returns the task. |
| DELETE /tasks/:id | Admin | Soft delete (sets archived_at, archived_by). 204. |
| POST /tasks/:id/restore | Admin | Clears archived_at. Powers Undo. |
| GET /tasks/:id/events | Admin, or the assignee | Timeline, newest first, with actor name. |

Rules:

- `updateTaskSchema` = `createTaskSchema.partial()` with at least one field required (zod `.refine`).
- Reassignment validates the new assignee is an active employee (reuse the check in `createTask`).
- Archived tasks return 404 to every endpoint except restore, and are excluded from `GET /tasks`.
- Employees keep `PATCH /tasks/:id/status` only. `PATCH /tasks/:id` from an employee returns 403.
- An employee who loses a task through reassignment can no longer read it (including its events). That is correct behaviour; add a test for it.

### 4.2 Event payloads

| Type | `data` |
| --- | --- |
| created | `{ title, assigneeId, projectId, priority, deadline }` |
| updated | `{ changes: { field: { from, to } } }`, only fields that actually changed; no event if nothing changed |
| reassigned | `{ fromId, toId }`, written separately from `updated` so it stands out in the timeline and drives its own notifications |
| status_changed | `{ from, to }` |
| archived / restored | `{}` |
| attachment_added / removed | `{ attachmentId, fileName }` |

Names are resolved at read time (join on users), so renaming a person does not rewrite history.

### 4.3 Client

- **Edit inline.** Admin rows get an "Edit" action. It opens the existing `TaskComposer` in edit mode, docked under that row instead of above the list. Refactor the composer to take `initial?: Task` and `mode: 'create' | 'edit'`, and send only changed fields.
- **Reassign** is just the assignee field in edit mode, plus a quick assignee select in the row's overflow menu.
- **Delete with Undo.** No confirm dialog (matches DESIGN.md). The row collapses and a toast reads "Task deleted. Undo" for 8 s. Undo calls `/restore`. Add one small `Toast` component (bottom-centre, ink band style).
- **Activity.** The expanded row (today it shows the description) gets two tabs: Details and Activity, and later Files. Activity is a compact timeline: "Admin moved this from Asha to Ben · 2 h ago", "Ben set status to In progress · yesterday". Load it lazily on first open.
- `types.ts`: add `projectId`, `project`, `updatedAt`, `completedAt` to `Task`; add `TaskEvent`.
- `api.ts`: add `updateTask`, `deleteTask`, `restoreTask`, `listTaskEvents`.

### 4.4 Tests (extend `server/test/api.test.ts`)

Admin edit returns the new values and writes one `updated` event containing only the changed fields · employee PATCH /tasks/:id gets 403 · reassign to an admin or unknown id gets 400 · reassigned-away employee gets 404 on the task and its events · delete hides the task from lists, restore brings it back · status change to done sets completed_at, and moving away clears it.

---

## 5. Phase 2: Notifications

### 5.1 What triggers a notification

| Trigger | Recipient | Example text |
| --- | --- | --- |
| Task created | assignee | "New task: Client demo prep, due Fri 17 Oct" |
| Reassigned | new assignee and previous assignee | "Admin assigned you Client demo prep" / "...was moved to Ben" |
| Deadline or priority changed | assignee | "Deadline for X moved to Mon 20 Oct" |
| Task deleted | assignee | "X was removed" |
| Status changed by the employee | all admins | "Ben marked X as Done" |
| Status changed by an admin | assignee | "Admin moved X back to In progress" |
| Attachment added by the other side | assignee or admins | "Asha added report.pdf to X" |
| Due tomorrow (daily job, 09:00) | assignee | "2 tasks due tomorrow" (one digest, not one per task) |
| Overdue (daily job, 09:00) | assignee + admins (digest) | "X is 1 day late" |
| Weekly report ready | admins | "Weekly report for 6 to 12 Oct is ready" |

Never notify people about their own actions.

### 5.2 Schema

`notifications`: id, user_id (FK), type (enum mirroring the triggers), task_id (nullable FK), event_id (nullable FK), title, body, link (client path), dedupe_key (nullable text), deliver_after (timestamptz, default now), read_at, emailed_at, created_at. Index on `(user_id, read_at, created_at desc)`. Unique index on `(user_id, dedupe_key)` where `dedupe_key is not null`.

- `dedupe_key` makes scheduled notifications idempotent: the daily reminder job writes keys like `due_tomorrow:2026-10-13` and `overdue:2026-10-13`, so a rerun on the same day inserts nothing (`on conflict do nothing`).
- `deliver_after` holds a notification back. It is `now()` for everything except task deletion (see 5.3).

`notification_preferences`: user_id PK, `email_enabled` boolean (default true), `email_digest` enum (`instant | daily | off`). Keep it to that for now.

### 5.3 Server design

- `services/notificationService.ts` exposes `notifyForEvent(tx, event)`. Task services call it inside the same transaction as the change, so a rollback never leaves an orphan notification.
- **Delete and Undo.** The "task removed" notification is written with `deliver_after = now() + 10 s` (the 8-second Undo window plus a margin). The bell, the unread count and the email outbox only read rows where `deliver_after <= now()`. Restoring a task deletes its undelivered `archived` notifications in the same transaction, so an undone delete never reaches the employee in-app or by email.
- Email goes out **after** commit through a small outbox: a worker loop (every 30 s, in-process) picks rows with `emailed_at is null` for users whose preference is instant, sends them, and stamps `emailed_at`. Failures retry on the next tick, so email never blocks or breaks an API call.
- `lib/mailer.ts`: nodemailer, configured by `SMTP_URL` and `MAIL_FROM`. If `SMTP_URL` is unset, email is disabled and logged. Add a `mailpit` service to `docker-compose.yml` (SMTP 1025, web UI 8025) for local testing.
- Scheduler: `node-cron` in `server/src/jobs/`, started from `index.ts` (not `app.ts`, so tests don't start jobs). Jobs: `dueReminders` (daily 09:00 REPORT_TZ), `emailOutbox` (every 30 s), and the weekly report (Phase 5). Each job takes a Postgres advisory lock so running two server instances never double-sends.

### 5.4 API

| Method and path | Purpose |
| --- | --- |
| GET /notifications?unread=&cursor= | Own notifications, 20 per page |
| GET /notifications/unread-count | `{ count }`, polled every 30 s |
| POST /notifications/:id/read | Mark one read |
| POST /notifications/read-all | Mark all read |
| GET / PUT /me/notification-preferences | Email preferences |

### 5.5 Client

- Bell button in `AppHeader` with an unread count (signal-yellow dot, number in ink). It opens a dropdown panel (not a modal) with the latest 10, "Mark all read", and a link to a full page. Clicking an item marks it read, navigates to the task list, scrolls to the row and flashes it, reusing `flash()` from `useTasks`.
- `useUnreadCount()` hook: polls every 30 s, pauses when the tab is hidden (`visibilitychange`), refetches on focus.
- When a new notification arrives and the current list is affected, call `reload()` so the timetable stays fresh. This gives "near real-time" without websockets.
- A small Settings popover for the email preference.

### 5.6 Tests

Event → correct recipients (and never the actor) · reassignment notifies both people · rollback leaves no notification · due-reminder job is idempotent for a given day (second run inserts nothing, via `dedupe_key`) · delete then restore within the Undo window leaves no notification and sends no email · a delete that is not undone is delivered after the window · outbox skips users with email off.

---

## 6. Phase 3: Attachments

### 6.1 Schema

`attachments`: id, task_id (FK), uploader_id (FK users), file_name (original, sanitised for display), storage_key (random uuid-based path, never the user's file name), mime_type, size_bytes, created_at, deleted_at.

### 6.2 Storage

`lib/storage.ts` interface: `put(key, stream)`, `get(key) → stream`, `remove(key)`. The first implementation is `LocalDiskStorage` writing to `UPLOAD_DIR` (default `server/uploads/`, added to `.gitignore`). An `S3Storage` can be added later behind `STORAGE_DRIVER=s3` without touching routes.

### 6.3 API

| Method and path | Access | Purpose |
| --- | --- | --- |
| GET /tasks/:id/attachments | Admin or assignee | List |
| POST /tasks/:id/attachments | Admin or assignee | `multipart/form-data`, field `file`; one file per request |
| GET /attachments/:id/download | Admin or assignee of the task | Streams the file with `Content-Disposition: attachment` |
| DELETE /attachments/:id | Uploader or admin | Soft delete; file removed by a nightly cleanup |

Security and limits:

- `multer` with memory limits: 10 MB per file, max 10 live attachments per task (checked in the service).
- Allowlist of types (pdf, png, jpg, webp, gif, txt, csv, docx, xlsx, pptx, zip), checked by extension **and** by sniffing magic bytes (`file-type` package), not by the browser-sent MIME alone.
- Files are never served statically. Every download goes through the auth and scoping check. Always use `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, so an uploaded HTML or SVG can never run in the app's origin.
- Writes `attachment_added` / `attachment_removed` events, which flow into the activity log and notifications automatically.

### 6.4 Client

- The `request()` wrapper in `api.ts` always sets `Content-Type: application/json`. Add a separate `upload()` helper that sends `FormData` without that header and reports progress (XHR, since fetch has no upload progress).
- Downloads need the bearer token, so plain links won't work. Fetch as a blob and trigger the save with an object URL.
- In the expanded row, a "Files" tab: a drag-and-drop zone plus a "Choose file" button, a list with name, size, uploader and time, an upload progress bar, and a remove action where allowed.
- A paperclip count in the row ("2") so people can see files exist without expanding.

### 6.5 Tests

Employee uploads to own task: 201 · to another's task: 403 · oversized file: 413 with a clear message · disallowed type (e.g. `.exe` renamed to `.pdf`): 400 · reassigned-away employee can no longer download · download response has the attachment headers.

---

## 7. Phase 4: Admin reports section and charts

### 7.1 Metric definitions

Pin these down first so charts, the weekly report and the CSV all agree. All exclude archived tasks.

| Metric | Definition |
| --- | --- |
| Open | status in (todo, in_progress) |
| Overdue | open and deadline < today (in REPORT_TZ) |
| Completed in period | completed_at within the period |
| On-time rate | of tasks completed in the period, share where `completed_at::date <= deadline` |
| Avg cycle time | mean of `completed_at - created_at` in days, for tasks completed in the period |
| Time in progress | from `status_changed` events: first move to in_progress until completed_at. Only available for tasks with status history, i.e. created or changed after the Phase 0 migration; older tasks are excluded from this metric (not counted as zero), and the UI shows "since <migration date>" next to it |
| Created in period | created_at within the period |
| Workload | open tasks per person, split by priority |

### 7.2 API (all admin-only, all accept `from`, `to`, and optional `projectId`, `assigneeId`)

| Path | Returns |
| --- | --- |
| GET /reports/summary | KPI tiles: open, overdue, completed, on-time rate, avg cycle time, each with the previous-period value for a delta |
| GET /reports/throughput?interval=week | Per week: created vs completed (line or bar) |
| GET /reports/status-breakdown?groupBy=project or employee | Per group: todo / in progress / done / overdue counts |
| GET /reports/projects | Table: one row per project with the metrics in 7.1 |
| GET /reports/employees | Table: one row per employee with the metrics in 7.1 and current workload |
| GET /reports/export.csv?type=projects or employees or tasks | CSV of the same data |

Implement as SQL aggregates through Drizzle (`count(*) filter (where ...)`, `date_trunc('week', ...)` with `at time zone REPORT_TZ`) in `services/reportService.ts`. No N+1 queries. Cap the range at 1 year.

### 7.3 Client: `/admin/reports`

- Add top-level navigation in the header band for admins: **Tasks · Reports · Projects**.
- Shared filter bar: date range (This week, Last week, Last 30 days, This quarter, Custom), project, employee. Filter state lives in the URL query, so views can be bookmarked and shared.
- **Overview tab:** five KPI tiles with deltas, a throughput chart (created vs completed per week), status by project (stacked horizontal bar), and an overdue list (top 10, links to the task).
- **By project tab:** sortable table (open, overdue, completed, on-time %, avg cycle time). Clicking a project opens its detail: throughput, status split, and per-employee contribution inside that project.
- **By employee tab:** sortable table with a line-colour swatch per person and a workload bar. Clicking a person opens their detail: throughput, on-time trend, open tasks by project, recent activity.
- Every table has "Export CSV".
- Charts follow DESIGN.md: tabular figures, hairline gridlines, Archivo condensed for axis labels, the signal yellow only for "today" or the current period, `--late` for overdue, `--done` for completed, employee series in their line colours. Each chart has a text summary for screen readers and a "view as table" toggle.
- Load Recharts only on the reports route (`React.lazy`) so the task pages don't get heavier.

### 7.4 Tests

Seed a fixed dataset with known dates and assert exact numbers for each metric (summary, per project, per employee, throughput buckets). Include the edge cases: tasks completed on the deadline day, tasks reopened after done, archived tasks, and a task that changed project mid-period (it counts under its current project; document that).

---

## 8. Phase 5: Weekly report generation

### 8.1 Schema

`weekly_reports`: id, week_start (date, unique), week_end, generated_at, generated_by (null when scheduled), data (jsonb snapshot), status (`ready | failed`).

Storing a snapshot means last month's report never changes when someone later edits or deletes a task, and opening an old report is instant.

### 8.2 Contents (the `data` snapshot)

1. Headline KPIs for the week, with the change from the previous week.
2. Completed this week, grouped by project (title, assignee, completed date, on time or late).
3. Slipped: tasks that became overdue this week.
4. Coming up: open tasks due next week, by person.
5. Per-employee table: completed, on-time %, open, overdue.
6. Per-project table: the same columns.
7. Notable activity: reassignments and deadline moves (from `task_events`).

It is built from the Phase 4 `reportService` functions with `from`/`to` set to the week, so the numbers match the reports page exactly.

### 8.3 Generation

- `jobs/weeklyReport.ts`: cron `0 8 * * 1` in REPORT_TZ, for the previous Monday to Sunday. Idempotent through the unique `week_start` and an advisory lock. On success it notifies admins (Phase 2) and queues an email.
- "Generate now" button for admins (POST /reports/weekly, body `{ weekStart }`), which regenerates and overwrites that week.
- Email: an HTML version of sections 1 to 4 (inline styles, works in Gmail and Outlook) with a link to the full report in the app, plus the CSV attached.

### 8.4 API and client

| Method and path | Purpose |
| --- | --- |
| GET /reports/weekly | List of generated weeks |
| GET /reports/weekly/:weekStart | One snapshot |
| GET /reports/weekly/:weekStart/export.csv | CSV |
| POST /reports/weekly | Generate or regenerate (admin) |

A "Weekly" tab in Reports: a list of weeks on the left and the report on the right, laid out like a printed bulletin with a print stylesheet, so "Print / Save as PDF" from the browser gives a clean PDF without a server-side PDF dependency.

Optional later: a personal weekly summary email for each employee (their own completed / slipped / upcoming).

---

## 9. Cross-cutting work

- **Config** (`lib/env.ts` and `.env.example`): `REPORT_TZ`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `SMTP_URL`, `MAIL_FROM`, `APP_URL` (for links in emails), `JOBS_ENABLED` (false in tests).
- **Dependencies.** Server: `node-cron`, `nodemailer`, `multer`, `file-type`. Client: `recharts`.
- **Rate limiting** on the upload and report-export endpoints (`express-rate-limit`).
- **Docs:** update PRD section 7 (out of scope), the TRD API table, the Backend Schema doc and the README API table. Fix the stale component names in the README layout section. Extend DESIGN.md with the toast, tabs-in-row, bell panel and chart rules.
- **Seed data:** enough history (8 weeks of events across 3 projects) that every chart and the weekly report look real in a demo.

---

## 10. Milestones and estimates (one developer)

| Milestone | Contents | Estimate |
| --- | --- | --- |
| M0 | Phase 0: projects, schema, migration and backfill, seed, project filter and chip | 2 to 3 days |
| M1 | Phase 1: edit, delete with Undo, reassign, activity timeline, tests | 3 to 4 days |
| M2 | Phase 2: in-app notifications, bell, polling, daily reminders; then email outbox and Mailpit | 4 to 5 days |
| M3 | Phase 3: attachments end to end, tests | 3 days |
| M4 | Phase 4: report service and metrics tests, reports UI with charts, CSV export | 5 to 6 days |
| M5 | Phase 5: weekly snapshot, scheduler, email, weekly tab with print layout | 3 days |
| | Buffer, docs and polish | 2 days |
| | **Total** | **about 22 to 26 working days** |

Each milestone ships on its own and keeps `npm test` and `npm run build` green.

---

## 11. Risks and how this plan handles them

| Risk | Mitigation |
| --- | --- |
| Metrics disagree between the charts, the weekly report and the CSV | One `reportService`, definitions fixed in 7.1, tests with exact expected numbers |
| Time zones shift deadlines or week boundaries | Deadlines stay plain dates; all bucketing uses `REPORT_TZ` in SQL; tests cover a task due on Sunday night |
| Duplicate emails or reports when more than one server runs | Postgres advisory locks plus unique keys on reminders and weekly reports |
| Uploaded files used as an attack vector | Type allowlist with byte sniffing, random storage keys, authenticated download only, `attachment` disposition with nosniff |
| History missing for tasks created before Phase 1 | Backfilled `created` events and `completed_at`; reports note that cycle time before the migration date is approximate, and time in progress only covers tasks with status history (see 7.1) |
| Notification noise | Never notify the actor; daily digests for reminders; per-user email preference |
| An undone delete still notifies the assignee | Delete notifications are held for the Undo window (`deliver_after`) and removed on restore (see 5.3) |
