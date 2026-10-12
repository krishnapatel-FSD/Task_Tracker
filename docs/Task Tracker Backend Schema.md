# Employee Task Tracker: Backend Schema

Oct 12, 2026 · @KRISHNA

PostgreSQL, defined with Drizzle ORM. Two tables and three enums.

## 1. Enums

| Enum | Values |
| --- | --- |
| role | admin, employee |
| priority | low, medium, high |
| status | todo, in\_progress, done |

## 2. Table: users

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | Primary key, default random |
| name | varchar(100) | Not null |
| email | varchar(255) | Not null, unique |
| password\_hash | text | Not null |
| role | role enum | Not null |
| created\_at | timestamptz | Not null, default now |

## 3. Table: tasks

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | Primary key, default random |
| title | varchar(150) | Not null |
| description | text | Not null |
| assignee\_id | uuid | Not null, foreign key to users.id |
| priority | priority enum | Not null |
| deadline | date | Not null |
| status | status enum | Not null, default todo |
| created\_at | timestamptz | Not null, default now |
| updated\_at | timestamptz | Not null, default now, set on every status change |

## 4. Relationships

One user (employee) has many tasks. Each task belongs to exactly one assignee through tasks.assignee\_id.

## 5. Indexes

- tasks\_assignee\_idx on tasks(assignee\_id): serves employee views and the assignee filter.
- tasks\_status\_idx on tasks(status): serves the status filter.
- users.email is unique, which also indexes login lookups.

## 6. Rules enforced outside the database

- The assignee must be a user whose role is employee. The API checks this on task creation.
- Only admins create tasks. Employees may only update the status of tasks where they are the assignee.

## 7. Drizzle schema (server/src/db/schema.ts)

```ts
import { pgTable, pgEnum, uuid, varchar, text, date, timestamp, index } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'employee']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high']);
export const statusEnum = pgEnum('status', ['todo', 'in_progress', 'done']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 150 }).notNull(),
    description: text('description').notNull(),
    assigneeId: uuid('assignee_id').notNull().references(() => users.id),
    priority: priorityEnum('priority').notNull(),
    deadline: date('deadline').notNull(),
    status: statusEnum('status').notNull().default('todo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_assignee_idx').on(t.assigneeId),
    index('tasks_status_idx').on(t.status),
  ],
);
```

## 8. Migrations and seed

- Generate migrations with drizzle-kit generate and apply them with drizzle-kit migrate.
- seed.ts inserts one admin and a few employees with bcrypt-hashed passwords.

## 9. Phase 2 additions

Migrations `0001` to `0004` in `server/src/db/migrations/`. The Drizzle source of truth is `server/src/db/schema.ts`.

| Table | Purpose | Key columns |
| --- | --- | --- |
| projects | Every task belongs to one | name (unique), description, colour_index (0 to 7), archived_at |
| tasks (changed) | | project_id (not null; existing tasks were moved into "General"), completed_at (set on done, cleared on leaving done), archived_at and archived_by (soft delete). updated_at now changes on every edit |
| task_events | Activity log, one row per change, written in the change's transaction | task_id, actor_id, type (created, updated, reassigned, status_changed, archived, restored, attachment_added, attachment_removed), data (jsonb) |
| notifications | In-app notifications and the email outbox | user_id, type, task_id, event_id, title, body, link, dedupe_key (unique per user when set), deliver_after (holds a delete for the Undo window), read_at, emailed_at |
| notification_preferences | Email settings per person | email_enabled, email_frequency (instant or daily) |
| attachments | Files on tasks | task_id, uploader_id, file_name (display only), storage_key (random, unique), mime_type, size_bytes, deleted_at, purged_at |
| weekly_reports | Frozen weekly snapshots | week_start (unique Monday), week_end, generated_by (null when scheduled), status (ready or failed), data (jsonb) |

New indexes: tasks(project_id), tasks(completed_at), tasks(deadline) where archived_at is null, task_events(task_id, created_at), notifications(user_id, read_at, created_at desc), notifications outbox (created_at where emailed_at is null), attachments(task_id) where deleted_at is null.
