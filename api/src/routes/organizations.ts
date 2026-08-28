import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import '../types.js';

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

// agent_api_key is deliberately excluded from GET /auth/me's organization
// payload -- it's the fleet-wide credential pc-agent authenticates with
// (see api/src/middleware/requireAgentKey.ts), not something every signed-in
// browser session needs. These two endpoints are the only way to read or
// change it, and both are ADMIN-only (STAFF can manage devices day-to-day
// without ever holding the credential that can register new ones).

organizationsRouter.get('/agent-key', requireRole('ADMIN'), async (req, res) => {
  const result = await pool.query('select agent_api_key from public.organizations where id = $1', [req.user!.organizationId]);
  res.json({ agent_api_key: result.rows[0]?.agent_api_key ?? null });
});

// Rotating breaks every already-installed agent for this org immediately --
// each one keeps sending its old AGENT_SECRET until someone updates its
// .env and restarts/reinstalls it. That's the point (a leaked key needs to
// actually stop working), but the console must say so before calling this,
// not just after.
organizationsRouter.post('/agent-key/rotate', requireRole('ADMIN'), async (req, res) => {
  const newKey = crypto.randomBytes(24).toString('hex');
  await pool.query('update public.organizations set agent_api_key = $1 where id = $2', [newKey, req.user!.organizationId]);
  res.json({ agent_api_key: newKey });
});
