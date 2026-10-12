import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { badRequest } from '../lib/errors.js';

/**
 * Validates req.body or req.query against a zod schema and stores the parsed
 * value in res.locals.body / res.locals.query. Invalid input is a 400.
 * (Express 5 makes req.query read-only, hence res.locals.)
 */
export const validate =
  (schema: z.ZodType, source: 'body' | 'query' = 'body'): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(source === 'body' ? (req.body ?? {}) : req.query);
    if (!result.success) {
      return next(badRequest(result.error.issues[0]?.message ?? 'Invalid input'));
    }
    res.locals[source] = result.data;
    next();
  };
