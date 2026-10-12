import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as taskService from '../services/taskService.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateStatusSchema,
  type CreateTaskInput,
  type ListTasksQuery,
  type UpdateStatusInput,
} from '../validation/schemas.js';

export const tasksRouter = Router();

tasksRouter.use(authenticate);

tasksRouter.get('/', validate(listTasksQuerySchema, 'query'), async (req, res) => {
  res.json(await taskService.listTasks(req.user!, res.locals.query as ListTasksQuery));
});

tasksRouter.post('/', requireRole('admin'), validate(createTaskSchema), async (_req, res) => {
  const task = await taskService.createTask(res.locals.body as CreateTaskInput);
  res.status(201).json(task);
});

tasksRouter.patch('/:id/status', validate(updateStatusSchema), async (req, res) => {
  const id = req.params.id as string;
  // A malformed id can't match any task.
  if (!z.uuid().safeParse(id).success) throw notFound('Task not found');

  const task = await taskService.updateTaskStatus(req.user!, id, res.locals.body as UpdateStatusInput);
  res.json(task);
});
