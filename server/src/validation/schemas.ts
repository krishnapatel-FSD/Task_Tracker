import { z } from 'zod';
import { priorityEnum, statusEnum } from '../db/schema.js';

const isRealDate = (value: string) => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150, 'Title must be at most 150 characters'),
  description: z.string().trim().min(1, 'Description is required'),
  assigneeId: z.uuid('Assignee must be a valid id'),
  priority: z.enum(priorityEnum.enumValues, 'Priority must be low, medium or high'),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Deadline must be a date (YYYY-MM-DD)')
    .refine(isRealDate, 'Deadline must be a valid date'),
});

export const updateStatusSchema = z.object({
  status: z.enum(statusEnum.enumValues, 'Status must be todo, in_progress or done'),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(statusEnum.enumValues, 'Status must be todo, in_progress or done').optional(),
  assigneeId: z.uuid('assigneeId must be a valid id').optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
