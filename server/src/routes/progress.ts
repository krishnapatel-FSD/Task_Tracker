import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { getProgress } from '../services/progressService.js';

/** GET /progress: the admin gets every employee, an employee only themselves. */
export const progressRouter = Router();

progressRouter.use(authenticate);

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');
const querySchema = z
  .object({ from: iso, to: iso, projectId: z.uuid().optional(), userId: z.uuid().optional() })
  .refine((v) => v.from <= v.to, 'from must be on or before to')
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 400, 'Pick at most about a year');

progressRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid period');
  res.json(await getProgress(req.user!, parsed.data));
});
