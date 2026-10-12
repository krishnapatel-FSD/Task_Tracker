import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import * as attachmentService from '../services/attachmentService.js';

/** Routes nested under /tasks/:id/attachments. */
export const taskAttachmentsRouter = Router({ mergeParams: true });
/** Routes for one attachment: /attachments/:id/... */
export const attachmentsRouter = Router();

taskAttachmentsRouter.use(authenticate);
attachmentsRouter.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: attachmentService.maxUploadBytes, files: 1, fields: 5 },
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Runs after authenticate, so every request has a user: limit per person.
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Too many uploads. Wait a minute and try again.' },
});

const requireUuid =
  (param: string, message: string): RequestHandler =>
  (req, _res, next) => {
    if (!z.uuid().safeParse(req.params[param]).success) return next(notFound(message));
    next();
  };

taskAttachmentsRouter.get('/', requireUuid('id', 'Task not found'), async (req, res) => {
  res.json(await attachmentService.listAttachments(req.user!, req.params.id as string));
});

taskAttachmentsRouter.post('/', requireUuid('id', 'Task not found'), uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a file to upload (form field "file").');
  const created = await attachmentService.addAttachment(req.user!, req.params.id as string, req.file);
  res.status(201).json(created);
});

attachmentsRouter.get('/:id/download', requireUuid('id', 'File not found'), async (req, res) => {
  const file = await attachmentService.openDownload(req.user!, req.params.id as string);
  // Always a download, never rendered in the app's origin, and no type guessing by the browser.
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
});

attachmentsRouter.delete('/:id', requireUuid('id', 'File not found'), async (req, res) => {
  await attachmentService.removeAttachment(req.user!, req.params.id as string);
  res.status(204).end();
});
