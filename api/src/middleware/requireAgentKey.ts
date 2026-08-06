import { RequestHandler } from 'express';
import { pool } from '../db.js';
import '../types.js';

// Authenticates the pc-agent itself (not a console user) via a per-org
// shared secret -- replaces the old model where the agent used Supabase's
// public anon key plus a separately-configured ORGANIZATION_ID. Now the
// key alone tells the server which org a device belongs to, so pc-agent's
// config no longer needs an ORGANIZATION_ID at all.
export const requireAgentKey: RequestHandler = async (req, res, next) => {
  const key = req.headers['x-agent-key'];
  if (!key || typeof key !== 'string') {
    res.status(401).json({ error: 'Missing X-Agent-Key header' });
    return;
  }

  const result = await pool.query('select id from public.organizations where agent_api_key = $1', [key]);
  const row = result.rows[0];
  if (!row) {
    res.status(401).json({ error: 'Invalid agent key' });
    return;
  }

  req.agentOrganizationId = row.id;
  next();
};
