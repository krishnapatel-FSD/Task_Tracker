import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import * as handoffService from '../services/handoffService.js';
import { handoffSchema, type HandoffInput } from '../validation/schemas.js';

/** Routes nested under /tasks/:id/handoff(s). */
export const taskHandoffsRouter = Router({ mergeParams: true });

taskHandoffsRouter.use(authenticate);

const taskId = (params: unknown) => {
  const id = (params as { id?: string }).id;
  if (!z.uuid().safeParse(id).success) throw notFound('Task not found');
  return id as string;
};

// A pre-filled summary from the task's checklist, recent comments and files.
taskHandoffsRouter.get('/draft', async (req, res) => {
  res.json(await handoffService.draftHandoff(req.user!, taskId(req.params)));
});

taskHandoffsRouter.get('/', async (req, res) => {
  res.json(await handoffService.listHandoffs(req.user!, taskId(req.params)));
});

taskHandoffsRouter.post('/', validate(handoffSchema), async (req, res) => {
  res.status(201).json(await handoffService.createHandoff(req.user!, taskId(req.params), res.locals.body as HandoffInput));
});

taskHandoffsRouter.post('/accept', async (req, res) => {
  res.json(await handoffService.acceptHandoff(req.user!, taskId(req.params)));
});
