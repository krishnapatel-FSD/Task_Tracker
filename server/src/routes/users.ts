import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as userService from '../services/userService.js';

export const usersRouter = Router();

// Names of the team, for the shared board's person filter. Ids and names only.
usersRouter.get('/', authenticate, async (_req, res) => {
  res.json(await userService.listEmployees());
});
