import { z } from 'zod';
import { priorityEnum, statusEnum } from '../db/schema.js';

const isRealDate = (value: string) => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const dateString = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD)`)
    .refine(isRealDate, `${label} must be a valid date`);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const password = z
  .string()
  .min(8, 'Use at least 8 characters for the password')
  .max(72, 'Keep the password to 72 characters');
const personName = z.string().trim().min(1, 'Enter a name').max(100, 'Keep the name to 100 characters');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);
const role = z.enum(['admin', 'employee'], 'Role must be admin or employee');

export const signupSchema = z.object({ name: personName, email, password });
export type SignupInput = z.infer<typeof signupSchema>;

export const verifySignupSchema = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export type VerifySignupInput = z.infer<typeof verifySignupSchema>;

export const googleLoginSchema = z.object({ credential: z.string().min(20, 'Missing Google sign-in token') });

export const createUserSchema = z.object({ name: personName, email, role, password });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({ name: personName, role, password })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

const taskFields = {
  title: z.string().trim().min(1, 'Title is required').max(150, 'Title must be at most 150 characters'),
  description: z.string().trim().min(1, 'Description is required'),
  assigneeId: z.uuid('Assignee must be a valid id'),
  projectId: z.uuid('Project must be a valid id'),
  priority: z.enum(priorityEnum.enumValues, 'Priority must be low, medium or high'),
  deadline: dateString('Deadline'),
};

const checklistText = z.string().trim().min(1, 'Checklist items need some text').max(200, 'Keep checklist items to 200 characters');
const checklist = z.array(checklistText).max(30, 'At most 30 checklist items');

export const createTaskSchema = z.object({
  ...taskFields,
  /** Steps to start the task with. */
  checklist: checklist.optional(),
});

export const updateTaskSchema = z
  .object(taskFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to change');

const commentBody = z
  .string('Write a comment')
  .trim()
  .min(1, 'Write a comment')
  .max(4000, 'Keep comments to 4000 characters or fewer');

/** A comment; `mentionIds` are the people picked from the @ list. */
export const commentSchema = z.object({
  body: commentBody,
  mentionIds: z.array(z.uuid('Mentions must be valid user ids')).max(20, 'Mention at most 20 people').default([]),
});
export type CommentInput = z.infer<typeof commentSchema>;

/** The note required when a task is marked done. */
export const completionNoteSchema = z.object({
  summary: z
    .string('Write a short summary of what was done')
    .trim()
    .min(3, 'Write a short summary of what was done')
    .max(2000, 'Keep the summary to 2000 characters or fewer'),
  minutesSpent: z
    .number('Enter how long it took')
    .int('Enter whole minutes')
    .min(1, 'Enter how long it took')
    .max(60 * 24 * 60, 'That is more than 60 days; check the time taken'),
});

export const updateStatusSchema = z
  .object({
    status: z.enum(statusEnum.enumValues, 'Status must be todo, in_progress or done'),
    note: completionNoteSchema.optional(),
  })
  .refine((v) => v.status !== 'done' || v.note !== undefined, {
    message: 'Add a summary of what was done and how long it took before marking the task done',
    path: ['note'],
  });

export const listTasksQuerySchema = z.object({
  status: z.enum(statusEnum.enumValues, 'Status must be todo, in_progress or done').optional(),
  assigneeId: z.uuid('assigneeId must be a valid id').optional(),
  projectId: z.uuid('projectId must be a valid id').optional(),
});

const projectName = z.string().trim().min(1, 'Project name is required').max(100, 'Project name must be at most 100 characters');
const colourIndex = z.number().int().min(0).max(7);

export const createProjectSchema = z.object({
  name: projectName,
  description: z.string().trim().max(500).optional(),
  colourIndex: colourIndex.optional(),
});

export const updateProjectSchema = z
  .object({
    name: projectName,
    description: z.string().trim().max(500).nullable(),
    colourIndex,
    archived: z.boolean(),
    skipWeekends: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to change');

export const listProjectsQuerySchema = z.object({
  all: z.enum(['true', 'false']).optional(),
  board: z.enum(['true', 'false']).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const addChecklistItemSchema = z.object({ text: checklistText });
export const updateChecklistItemSchema = z
  .object({ text: checklistText, done: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Send text or done');

const handoffLine = z.string().trim().min(1).max(300, 'Keep each line to 300 characters');

export const handoffSchema = z.object({
  toUserId: z.uuid('Pick who takes the task over'),
  done: z.array(handoffLine).max(40).default([]),
  remaining: z.array(handoffLine).max(40).default([]),
  blockers: z.string().trim().max(2000).default(''),
  decisions: z.string().trim().max(4000).default(''),
  attachmentIds: z.array(z.uuid()).max(50).default([]),
});
export type HandoffInput = z.infer<typeof handoffSchema>;

export const holidaySchema = z.object({
  date: dateString('Date'),
  name: z.string().trim().min(1, 'Name the day off').max(100),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export { dateString };
