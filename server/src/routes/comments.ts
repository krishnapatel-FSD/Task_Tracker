import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import * as commentService from '../services/commentService.js';
import { commentSchema, type CommentInput } from '../validation/schemas.js';

/** Routes nested under /tasks/:id/comments. */
export const taskCommentsRouter = Router({ mergeParams: true });
/** Routes for one comment: /comments/:id/... */
export const commentsRouter = Router();

taskCommentsRouter.use(authenticate);
commentsRouter.use(authenticate);

const requireUuid =
  (what: string): RequestHandler =>
  (req, _res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) return next(notFound(`${what} not found`));
    next();
  };

taskCommentsRouter.get('/', requireUuid('Task'), async (req, res) => {
  res.json(await commentService.listComments(req.user!, req.params.id as string));
});

taskCommentsRouter.post('/', requireUuid('Task'), validate(commentSchema), async (req, res) => {
  res.status(201).json(await commentService.addComment(req.user!, req.params.id as string, res.locals.body as CommentInput));
});

commentsRouter.patch('/:id', requireUuid('Comment'), validate(commentSchema), async (req, res) => {
  res.json(await commentService.editComment(req.user!, req.params.id as string, res.locals.body as CommentInput));
});

commentsRouter.delete('/:id', requireUuid('Comment'), async (req, res) => {
  await commentService.deleteComment(req.user!, req.params.id as string);
  res.status(204).end();
});

commentsRouter.post('/:id/restore', requireUuid('Comment'), async (req, res) => {
  await commentService.restoreComment(req.user!, req.params.id as string);
  res.status(204).end();
});

commentsRouter.get('/:id/revisions', requireUuid('Comment'), async (req, res) => {
  res.json(await commentService.listRevisions(req.user!, req.params.id as string));
});
