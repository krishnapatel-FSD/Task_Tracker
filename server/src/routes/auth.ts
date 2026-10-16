import { Router } from 'express';
import { verifyCaller } from '../middleware/authenticate.js';
import * as authService from '../services/authService.js';

// Sign-up, sign-in, the emailed code and 2FA all happen in Supabase Auth, straight from the
// browser. The API only says who may sign up and returns the app account for a login.
export const authRouter = Router();

authRouter.get('/options', (_req, res) => {
  res.json(authService.signInOptions());
});

// The signed-in person's app account; made on their first sign-in.
authRouter.get('/me', async (req, res) => {
  res.json(await authService.accountFor(await verifyCaller(req)));
});
