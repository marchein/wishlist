import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import type { DB } from './db.js';
import { HttpError } from './errors.js';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string): string {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
}

function userFromToken(db: DB, header: string | undefined): AuthUser | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) return undefined;
    const row = db
      .prepare('SELECT id, email, display_name FROM users WHERE id = ?')
      .get(payload.sub) as { id: string; email: string; display_name: string } | undefined;
    return row && { id: row.id, email: row.email, displayName: row.display_name };
  } catch {
    return undefined;
  }
}

/** Attaches req.user when a valid token is present, but lets anonymous requests through. */
export function optionalAuth(db: DB): RequestHandler {
  return (req, _res, next) => {
    req.user = userFromToken(db, req.headers.authorization);
    next();
  };
}

export function requireAuth(db: DB): RequestHandler {
  return (req, _res, next) => {
    req.user = userFromToken(db, req.headers.authorization);
    if (!req.user) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
    next();
  };
}
