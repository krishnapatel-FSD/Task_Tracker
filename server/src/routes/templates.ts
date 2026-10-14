import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as templateService from '../services/templateService.js';
import { previewRuleSchema, templateSchema, type PreviewRuleInput, type TemplateInput } from '../validation/schemas.js';

/** Task templates and repeat schedules. Admin only. */
export const templatesRouter = Router();

templatesRouter.use(authenticate, requireRole('admin'));

const idOf = (raw: unknown) => {
  if (!z.uuid().safeParse(raw).success) throw notFound('Template not found');
  return raw as string;
};

templatesRouter.get('/', async (_req, res) => {
  res.json(await templateService.listTemplates());
});

templatesRouter.post('/preview', validate(previewRuleSchema), async (_req, res) => {
  res.json(await templateService.previewRule(res.locals.body as PreviewRuleInput));
});

templatesRouter.post('/', validate(templateSchema), async (req, res) => {
  res.status(201).json(await templateService.createTemplate(req.user!, res.locals.body as TemplateInput));
});

templatesRouter.put('/:id', validate(templateSchema), async (req, res) => {
  res.json(await templateService.updateTemplate(idOf(req.params.id), res.locals.body as TemplateInput));
});

templatesRouter.delete('/:id', async (req, res) => {
  await templateService.archiveTemplate(idOf(req.params.id));
  res.status(204).end();
});
