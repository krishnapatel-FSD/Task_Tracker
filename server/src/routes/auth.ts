import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/authService.js';
import { googleLoginSchema, loginSchema, signupSchema, type LoginInput, type SignupInput } from '../validation/schemas.js';

export const authRouter = Router();

// New accounts per visitor address: enough for a team, not for a script.
const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

// What the sign-in page shows: sign-up link and Google button.
authRouter.get('/options', (_req, res) => {
  res.json(authService.signInOptions());
});

authRouter.post('/login', validate(loginSchema), async (_req, res) => {
  const result = await authService.login(res.locals.body as LoginInput);
  res.json(result);
});

authRouter.post('/signup', signupLimiter, validate(signupSchema), async (_req, res) => {
  res.status(201).json(await authService.signup(res.locals.body as SignupInput));
});

authRouter.post('/google', signupLimiter, validate(googleLoginSchema), async (_req, res) => {
  res.json(await authService.loginWithGoogle((res.locals.body as { credential: string }).credential));
});
