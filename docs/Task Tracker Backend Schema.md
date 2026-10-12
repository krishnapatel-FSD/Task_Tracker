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
