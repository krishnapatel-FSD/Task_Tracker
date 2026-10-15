import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { deliverMail, mailStatus } from '../lib/mailer.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

// Admin only: is email working? Shows how mail goes out and sends a test message.
export const mailRouter = Router();
mailRouter.use(authenticate, requireRole('admin'));

mailRouter.get('/status', (_req, res) => {
  res.json(mailStatus());
});

mailRouter.post('/test', async (req, res) => {
  const to = z.string().trim().toLowerCase().email().safeParse(req.body?.to);
  if (!to.success) throw badRequest('Enter a valid email address');
  try {
    const result = await deliverMail({
      to: to.data,
      subject: 'Task Tracker test email',
      text: 'This is a test from Task Tracker. If you can read it, sign-up codes and notifications can reach this inbox.\n',
    });
    res.json({ ...mailStatus(), ...result });
  } catch (err) {
    res.status(502).json({ ...mailStatus(), outcome: 'failed', error: err instanceof Error ? err.message : String(err) });
  }
});
