import type { RequestHandler } from 'express';
import { unauthorized } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';

/** Verifies the Bearer token and sets req.user. Rejects with 401 otherwise. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;

  const user = token ? verifyToken(token) : null;
  if (!user) {
    return next(unauthorized('Missing or invalid token'));
  }

  req.user = user;
  next();
};
