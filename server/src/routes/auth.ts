import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/authService.js';
import { loginSchema, type LoginInput } from '../validation/schemas.js';

export const authRouter = Router();

authRouter.post('/login', validate(loginSchema), async (_req, res) => {
  const result = await authService.login(res.locals.body as LoginInput);
  res.json(result);
});
