import { Router, type RequestHandler } from 'express';
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
  updateTaskSchema,
  type CreateTaskInput,
  type ListTasksQuery,
  type UpdateStatusInput,
  type UpdateTaskInput,
} from '../validation/schemas.js';

export const tasksRouter = Router();

tasksRouter.use(authenticate);

/** A malformed id can't match any task, so it is a 404 rather than a database error. */
const requireUuidParam: RequestHandler = (req, _res, next) => {
  if (!z.uuid().safeParse(req.params.id).success) return next(notFound('Task not found'));
  next();
};

tasksRouter.get('/', validate(listTasksQuerySchema, 'query'), async (req, res) => {
  res.json(await taskService.listTasks(req.user!, res.locals.query as ListTasksQuery));
});

tasksRouter.post('/', requireRole('admin'), validate(createTaskSchema), async (req, res) => {
  const task = await taskService.createTask(req.user!, res.locals.body as CreateTaskInput);
  res.status(201).json(task);
});

tasksRouter.patch('/:id', requireUuidParam, requireRole('admin'), validate(updateTaskSchema), async (req, res) => {
  res.json(await taskService.updateTask(req.user!, req.params.id as string, res.locals.body as UpdateTaskInput));
});

tasksRouter.delete('/:id', requireUuidParam, requireRole('admin'), async (req, res) => {
  await taskService.archiveTask(req.user!, req.params.id as string);
  res.status(204).end();
});

tasksRouter.post('/:id/restore', requireUuidParam, requireRole('admin'), async (req, res) => {
  res.json(await taskService.restoreTask(req.user!, req.params.id as string));
});

tasksRouter.patch('/:id/status', requireUuidParam, validate(updateStatusSchema), async (req, res) => {
  res.json(await taskService.updateTaskStatus(req.user!, req.params.id as string, res.locals.body as UpdateStatusInput));
});

tasksRouter.get('/:id/notes', requireUuidParam, async (req, res) => {
  res.json(await taskService.listTaskNotes(req.user!, req.params.id as string));
});

tasksRouter.get('/:id/events', requireUuidParam, async (req, res) => {
  res.json(await taskService.listTaskEvents(req.user!, req.params.id as string));
});
