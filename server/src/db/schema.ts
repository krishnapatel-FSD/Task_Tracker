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

export type Role = (typeof roleEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
