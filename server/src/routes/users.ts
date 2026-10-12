import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import * as userService from '../services/userService.js';

export const usersRouter = Router();

usersRouter.get('/', authenticate, requireRole('admin'), async (_req, res) => {
  res.json(await userService.listEmployees());
});
