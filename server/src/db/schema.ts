import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
  smallint,
  jsonb,
  boolean,
  integer,
  uniqueIndex,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'employee']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high']);
export const statusEnum = pgEnum('status', ['todo', 'in_progress', 'done']);
export const taskEventTypeEnum = pgEnum('task_event_type', [
  'created',
  'updated',
  'reassigned',
  'status_changed',
  'archived',
  'restored',
  'attachment_added',
  'attachment_removed',
  'handed_off',
  'handoff_accepted',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  /** The person's login in Supabase Auth (auth.users.id). Passwords, codes and 2FA live there. */
  authId: uuid('auth_id').unique(),
  /** Only kept to move older accounts into Supabase Auth with their existing password. */
  passwordHash: text('password_hash'),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Email domains that may create their own account; read by the Supabase sign-up hook. */
export const signupDomains = pgTable('signup_domains', {
  domain: varchar('domain', { length: 255 }).primaryKey(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  colourIndex: smallint('colour_index').notNull().default(0),
  /** The calendar marks deadlines on a Saturday or Sunday in this project as days off. */
  skipWeekends: boolean('skip_weekends').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 150 }).notNull(),
    description: text('description').notNull(),
    assigneeId: uuid('assignee_id').notNull().references(() => users.id),
    projectId: uuid('project_id').notNull().references(() => projects.id),
    priority: priorityEnum('priority').notNull(),
    deadline: date('deadline').notNull(),
    status: statusEnum('status').notNull().default('todo'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: uuid('archived_by').references((): AnyPgColumn => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_assignee_idx').on(t.assigneeId),
    index('tasks_status_idx').on(t.status),
    index('tasks_project_idx').on(t.projectId),
    index('tasks_completed_at_idx').on(t.completedAt),
    index('tasks_live_deadline_idx').on(t.deadline).where(sql`${t.archivedAt} is null`),
  ],
);

/** The activity log. One row per change, written in the same transaction as the change. */
export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id),
    actorId: uuid('actor_id').notNull().references(() => users.id),
    type: taskEventTypeEnum('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_events_task_created_idx').on(t.taskId, t.createdAt)],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
export type TaskEventType = (typeof taskEventTypeEnum.enumValues)[number];

export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'task_unassigned',
  'task_updated',
  'task_removed',
  'status_changed',
  'attachment_added',
  'due_tomorrow',
  'overdue',
  'weekly_report',
  'mentioned',
  'comment_added',
  'handoff_received',
  'handoff_accepted',
]);
export const emailFrequencyEnum = pgEnum('email_frequency', ['instant', 'daily']);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    type: notificationTypeEnum('type').notNull(),
    taskId: uuid('task_id').references(() => tasks.id),
    eventId: uuid('event_id').references(() => taskEvents.id),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    /** Client path the notification opens. */
    link: varchar('link', { length: 300 }),
    /** Makes scheduled notifications idempotent, e.g. "due_tomorrow:2026-10-13". */
    dedupeKey: varchar('dedupe_key', { length: 100 }),
    /** Held back until this time (used for the delete Undo window). */
    deliverAfter: timestamp('deliver_after', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_read_created_idx').on(t.userId, t.readAt, t.createdAt.desc()),
    uniqueIndex('notifications_user_dedupe_idx').on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
    index('notifications_outbox_idx').on(t.createdAt).where(sql`${t.emailedAt} is null`),
  ],
);

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  emailFrequency: emailFrequencyEnum('email_frequency').notNull().default('instant'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id),
    uploaderId: uuid('uploader_id').notNull().references(() => users.id),
    /** Original name, sanitised, for display and the download filename only. */
    fileName: varchar('file_name', { length: 200 }).notNull(),
    /** Random path in storage. Never derived from the user's file name. */
    storageKey: varchar('storage_key', { length: 200 }).notNull().unique(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** Set by the nightly cleanup once the file itself is gone. */
    purgedAt: timestamp('purged_at', { withTimezone: true }),
  },
  (t) => [index('attachments_task_idx').on(t.taskId).where(sql`${t.deletedAt} is null`)],
);

/**
 * Notes on a task. Marking a task done always adds one: a summary of the work and
 * how long it took. Visible to the admin and the assignee, like the task itself.
 */
export const taskNotes = pgTable(
  'task_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id),
    authorId: uuid('author_id').notNull().references(() => users.id),
    summary: text('summary').notNull(),
    /** Time the work took, in minutes, as reported by the person completing it. */
    minutesSpent: integer('minutes_spent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_notes_task_created_idx').on(t.taskId, t.createdAt.desc())],
);

/**
 * Conversation on a task while the work is going on. Separate from completion notes.
 * Deleting only hides a comment (deleted_at); edits keep the previous text in revisions.
 */
export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id),
    authorId: uuid('author_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references((): AnyPgColumn => users.id),
  },
  (t) => [index('task_comments_task_created_idx').on(t.taskId, t.createdAt)],
);

/** The audit trail: one row per edit, holding the text as it was before that edit. */
export const taskCommentRevisions = pgTable(
  'task_comment_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commentId: uuid('comment_id').notNull().references(() => taskComments.id),
    body: text('body').notNull(),
    editorId: uuid('editor_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_comment_revisions_comment_idx').on(t.commentId, t.createdAt)],
);

/** Who a comment mentions. */
export const commentMentions = pgTable(
  'comment_mentions',
  {
    commentId: uuid('comment_id').notNull().references(() => taskComments.id),
    userId: uuid('user_id').notNull().references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

/**
 * A task handed from one person to another, with what the new owner needs to know.
 * Until `acceptedAt` is set the task is locked for its new assignee.
 */
export const taskHandoffs = pgTable(
  'task_handoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id),
    fromUserId: uuid('from_user_id').notNull().references(() => users.id),
    toUserId: uuid('to_user_id').notNull().references(() => users.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    done: jsonb('done').$type<string[]>().notNull().default([]),
    remaining: jsonb('remaining').$type<string[]>().notNull().default([]),
    blockers: text('blockers'),
    decisions: text('decisions'),
    attachmentIds: jsonb('attachment_ids').$type<string[]>().notNull().default([]),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('task_handoffs_task_idx').on(t.taskId, t.createdAt),
    // at most one handoff waiting on a task
    uniqueIndex('task_handoffs_one_pending_idx').on(t.taskId).where(sql`${t.acceptedAt} is null`),
  ],
);

/** Tick-able steps inside a task. The admin and the assignee manage them. */
export const taskChecklistItems = pgTable(
  'task_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id),
    text: varchar('text', { length: 200 }).notNull(),
    position: integer('position').notNull(),
    doneAt: timestamp('done_at', { withTimezone: true }),
    doneBy: uuid('done_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_checklist_items_task_idx').on(t.taskId, t.position)],
);

/** Days off in a project, marked on the calendar. */
export const projectHolidays = pgTable(
  'project_holidays',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id),
    date: date('date').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.date] })],
);

export const weeklyReportStatusEnum = pgEnum('weekly_report_status', ['ready', 'failed']);

/** A frozen copy of one week's numbers: later edits to tasks never change it. */
export const weeklyReports = pgTable('weekly_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekStart: date('week_start').notNull().unique(),
  weekEnd: date('week_end').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Null when the scheduled job made it. */
  generatedBy: uuid('generated_by').references(() => users.id),
  status: weeklyReportStatusEnum('status').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
});
