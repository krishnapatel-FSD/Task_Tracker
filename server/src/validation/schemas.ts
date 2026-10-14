import { z } from 'zod';
import { priorityEnum, repeatEnum, statusEnum } from '../db/schema.js';

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
  /** Steps to start the task with, e.g. copied from a template. */
  checklist: checklist.optional(),
  /** The template the form was filled from, if any. */
  templateId: z.uuid().optional(),
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

/** Repeat rule fields; checked together so each kind has what it needs. */
const ruleFields = {
  repeat: z.enum(repeatEnum.enumValues, 'Repeat must be none, daily, weekly, monthly or interval'),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  monthDay: z.number().int().min(1).max(31).nullable().default(null),
  intervalDays: z.number().int().min(2, 'Repeat every 2 days or more').max(365).nullable().default(null),
  startDate: dateString('Start date'),
  endDate: dateString('End date').nullable().default(null),
  leadDays: z.number().int().min(0).max(30, 'Create tasks at most 30 days ahead').default(3),
};

type RuleShape = {
  repeat: string;
  weekdays: number[];
  monthDay: number | null;
  intervalDays: number | null;
  startDate: string;
  endDate: string | null;
};

function checkRule(v: RuleShape, ctx: z.RefinementCtx) {
  if (v.repeat === 'weekly' && v.weekdays.length === 0) ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'Pick at least one day of the week' });
  if (v.repeat === 'monthly' && v.monthDay === null) ctx.addIssue({ code: 'custom', path: ['monthDay'], message: 'Pick a day of the month' });
  if (v.repeat === 'interval' && v.intervalDays === null) ctx.addIssue({ code: 'custom', path: ['intervalDays'], message: 'Say how many days apart' });
  if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date' });
}

export const templateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the template').max(100, 'Keep the name to 100 characters'),
    title: taskFields.title,
    description: taskFields.description,
    projectId: taskFields.projectId,
    assigneeId: z.uuid('Assignee must be a valid id').nullable().default(null),
    priority: taskFields.priority,
    checklist: checklist.default([]),
    paused: z.boolean().default(false),
    ...ruleFields,
  })
  .superRefine((v, ctx) => {
    checkRule(v, ctx);
    if (v.repeat !== 'none' && !v.assigneeId) ctx.addIssue({ code: 'custom', path: ['assigneeId'], message: 'A repeating template needs someone to assign the tasks to' });
  });
export type TemplateInput = z.infer<typeof templateSchema>;

/** Preview the next deadlines for a rule before saving it. */
export const previewRuleSchema = z.object({ projectId: taskFields.projectId, ...ruleFields }).superRefine(checkRule);
export type PreviewRuleInput = z.infer<typeof previewRuleSchema>;

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
