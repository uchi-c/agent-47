import { RequestHandler } from 'express';
import { pool } from '../db.js';
import { verifyToken } from '../lib/jwt.js';
import '../types.js';

// Loads the full user + their organization on every request rather than
// trusting only what's in the JWT -- a role change or org reassignment
// takes effect on the very next request instead of waiting out a 30-day
// token's lifetime.
//
// "First membership" mirrors the same simplification the console makes
// (services/organizations.ts:fetchMyOrganization) -- a user could belong
// to more than one organization in the schema, but the product only ever
// shows/acts on one at a time.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  let userId: string;
  try {
    userId = verifyToken(token).sub;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const result = await pool.query(
    `select u.id, u.name, u.email, u.role, m.org_id as "organizationId"
     from public.users u
     join public.user_organization_memberships m on m.user_id = u.id
     where u.id = $1
     order by m.created_at asc
     limit 1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) {
    res.status(401).json({ error: 'Account no longer exists' });
    return;
  }

  req.user = row;
  next();
};

export function requireRole(...roles: Array<'ADMIN' | 'STAFF'>): RequestHandler {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Not allowed for your role' });
      return;
    }
    next();
  };
}
