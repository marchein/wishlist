import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

/** `code` is stable and meant for clients to translate; `message` is an English fallback. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') =>
  new HttpError(404, `${what.toUpperCase()}_NOT_FOUND`, `${what} not found`);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message, params: err.params });
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(400).json({
      code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED',
      message: tooLarge ? 'File is too large' : err.message,
    });
    return;
  }
  // body-parser errors (malformed JSON, payload too large) carry a status.
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ code: 'BAD_REQUEST', message: err.expose ? err.message : 'Bad request' });
    return;
  }
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
