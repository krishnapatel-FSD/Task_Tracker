import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../lib/env.js';
import { HttpError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

/** Turns every error into the API's { error: message } shape. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? res.status(413).json({ error: `Files can be up to ${env.MAX_UPLOAD_MB} MB.` })
      : res.status(400).json({ error: 'Upload one file at a time, in the "file" field.' });
  }
  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
