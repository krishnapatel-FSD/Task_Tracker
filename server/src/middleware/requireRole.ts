import type { RequestHandler } from 'express';
import type { Role } from '../db/schema.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/** Must run after authenticate. Rejects callers whose role is not allowed with 403. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
