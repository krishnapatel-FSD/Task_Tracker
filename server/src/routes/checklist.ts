import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import * as checklistService from '../services/checklistService.js';
import { addChecklistItemSchema, updateChecklistItemSchema } from '../validation/schemas.js';

/** Routes nested under /tasks/:id/checklist. */
export const taskChecklistRouter = Router({ mergeParams: true });
/** Routes for one item: /checklist/:id */
export const checklistRouter = Router();

taskChecklistRouter.use(authenticate);
checklistRouter.use(authenticate);

const idOf = (raw: unknown, what: string) => {
  if (!z.uuid().safeParse(raw).success) throw notFound(`${what} not found`);
  return raw as string;
};

taskChecklistRouter.get('/', async (req, res) => {
  res.json(await checklistService.listItems(req.user!, idOf((req.params as { id?: string }).id, 'Task')));
});

taskChecklistRouter.post('/', validate(addChecklistItemSchema), async (req, res) => {
  res.status(201).json(await checklistService.addItem(req.user!, idOf((req.params as { id?: string }).id, 'Task'), (res.locals.body as { text: string }).text));
});

checklistRouter.patch('/:id', validate(updateChecklistItemSchema), async (req, res) => {
  await checklistService.updateItem(req.user!, idOf(req.params.id, 'Checklist item'), res.locals.body as { text?: string; done?: boolean });
  res.status(204).end();
});

checklistRouter.delete('/:id', async (req, res) => {
  await checklistService.removeItem(req.user!, idOf(req.params.id, 'Checklist item'));
  res.status(204).end();
});
