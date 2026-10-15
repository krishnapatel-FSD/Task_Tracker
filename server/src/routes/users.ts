import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as userService from '../services/userService.js';
import { createUserSchema, updateUserSchema, type CreateUserInput, type UpdateUserInput } from '../validation/schemas.js';

export const usersRouter = Router();

// Everyone, admin included, for @mentions in comments.
usersRouter.get('/people', authenticate, async (_req, res) => {
  res.json(await userService.listPeople());
});

// Names of the team, for the shared board's person filter. Ids and names only.
usersRouter.get('/', authenticate, async (_req, res) => {
  res.json(await userService.listEmployees());
});

// The People page: accounts with emails, added and changed by the admin.
usersRouter.get('/accounts', authenticate, requireRole('admin'), async (_req, res) => {
  res.json(await userService.listAccounts());
});

usersRouter.post('/', authenticate, requireRole('admin'), validate(createUserSchema), async (_req, res) => {
  res.status(201).json(await userService.createAccount(res.locals.body as CreateUserInput));
});

usersRouter.patch('/:id', authenticate, requireRole('admin'), validate(updateUserSchema), async (req, res) => {
  const id = req.params.id as string;
  if (!z.uuid().safeParse(id).success) throw notFound('Person not found');
  res.json(await userService.updateAccount(req.user!, id, res.locals.body as UpdateUserInput));
});
