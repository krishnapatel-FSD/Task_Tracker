import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import * as notificationService from '../services/notificationService.js';

export const notificationsRouter = Router();
export const meRouter = Router();

notificationsRouter.use(authenticate);
meRouter.use(authenticate);

const listQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  cursor: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

notificationsRouter.get('/', validate(listQuery, 'query'), async (req, res) => {
  const q = res.locals.query as z.infer<typeof listQuery>;
  res.json(await notificationService.listNotifications(req.user!.id, { unread: q.unread === 'true', before: q.cursor, limit: q.limit }));
});

notificationsRouter.get('/unread-count', async (req, res) => {
  res.json({ count: await notificationService.unreadCount(req.user!.id) });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await notificationService.markAllRead(req.user!.id);
  res.status(204).end();
});

notificationsRouter.post('/:id/read', async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) throw notFound('Notification not found');
  await notificationService.markRead(req.user!.id, req.params.id as string);
  res.status(204).end();
});

const prefsSchema = z.object({
  emailEnabled: z.boolean(),
  emailFrequency: z.enum(['instant', 'daily']),
});

meRouter.get('/notification-preferences', async (req, res) => {
  res.json(await notificationService.getPreferences(req.user!.id));
});

meRouter.put('/notification-preferences', validate(prefsSchema), async (req, res) => {
  res.json(await notificationService.setPreferences(req.user!.id, res.locals.body as z.infer<typeof prefsSchema>));
});
