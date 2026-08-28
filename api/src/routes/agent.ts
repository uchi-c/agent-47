import { Router } from 'express';
import { pool } from '../db.js';
import { requireAgentKey } from '../middleware/requireAgentKey.js';
import '../types.js';

export const agentRouter = Router();
agentRouter.use(requireAgentKey);

const DEVICE_COLUMNS = `id, organization_id, computer_name, computer_code, hostname, ip_address,
  cpu_usage, ram_usage, disk_usage, last_seen, customer_id, lease_status, security_status,
  recovery_message, flagged_at, recovered_at, wiped_at`;

// Keep in sync with console/src/types.ts's PERSONAL_PLAN_DEVICE_LIMIT (the
// console shows this same number so an org can see it coming before an
// install actually gets rejected).
const PERSONAL_PLAN_DEVICE_LIMIT = 3;

async function loadDeviceByCode(organizationId: string, computerCode: string) {
  const result = await pool.query(`select ${DEVICE_COLUMNS} from public.computers where computer_code = $1`, [computerCode]);
  const row = result.rows[0];
  if (!row) return { row: null, conflict: false };
  if (row.organization_id !== organizationId) return { row: null, conflict: true };
  return { row, conflict: false };
}

agentRouter.post('/register', async (req, res) => {
  const { computer_code } = req.body ?? {};
  if (typeof computer_code !== 'string' || !computer_code.trim()) {
    res.status(400).json({ error: 'computer_code is required' });
    return;
  }

  const existing = await loadDeviceByCode(req.agentOrganizationId!, computer_code);
  if (existing.conflict) {
    res.status(409).json({ error: `computer_code ${computer_code} is already registered to a different organization` });
    return;
  }
  if (existing.row) {
    res.json(existing.row);
    return;
  }

  // Only the personal plan caps device count -- this only runs when
  // actually registering a brand-new device, not on every heartbeat.
  const orgResult = await pool.query(
    `select plan, (select count(*)::int from public.computers where organization_id = o.id) as device_count
     from public.organizations o where o.id = $1`,
    [req.agentOrganizationId],
  );
  const org = orgResult.rows[0];
  if (org?.plan === 'personal' && org.device_count >= PERSONAL_PLAN_DEVICE_LIMIT) {
    res.status(402).json({
      error: `The personal plan is limited to ${PERSONAL_PLAN_DEVICE_LIMIT} devices. Upgrade to the business plan in the console to connect more.`,
    });
    return;
  }

  const result = await pool.query(
    `insert into public.computers (organization_id, computer_name, computer_code) values ($1, $2, $2)
     returning ${DEVICE_COLUMNS}`,
    [req.agentOrganizationId, computer_code.trim()],
  );
  res.status(201).json(result.rows[0]);
});

agentRouter.get('/devices/:computerCode', async (req, res) => {
  const { row, conflict } = await loadDeviceByCode(req.agentOrganizationId!, req.params.computerCode);
  if (conflict || !row) {
    res.status(404).json({ error: 'Device not found for this agent key' });
    return;
  }
  res.json(row);
});

agentRouter.patch('/devices/:computerCode/wiped', async (req, res) => {
  const { conflict } = await loadDeviceByCode(req.agentOrganizationId!, req.params.computerCode);
  if (conflict) {
    res.status(404).json({ error: 'Device not found for this agent key' });
    return;
  }
  const result = await pool.query(
    `update public.computers set wiped_at = timezone('utc', now()) where computer_code = $1 and organization_id = $2`,
    [req.params.computerCode, req.agentOrganizationId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Device not found for this agent key' });
    return;
  }
  res.json({ ok: true });
});

agentRouter.post('/heartbeat', async (req, res) => {
  const { computer_code, cpu, ram, disk, hostname, ip_address, public_ip } = req.body ?? {};
  const { row, conflict } = await loadDeviceByCode(req.agentOrganizationId!, computer_code ?? '');
  if (conflict || !row) {
    res.status(404).json({ error: 'Device not found for this agent key -- call /register first' });
    return;
  }

  await pool.query(
    `update public.computers
     set cpu_usage = $1, ram_usage = $2, disk_usage = $3, hostname = $4, ip_address = $5, last_seen = timezone('utc', now())
     where id = $6`,
    [cpu ?? null, ram ?? null, disk ?? null, hostname ?? null, ip_address ?? null, row.id],
  );

  // Only append a location-history row when the public IP actually changed
  // since the last one -- otherwise a 30s heartbeat turns this into an
  // unbounded "still here" log. See database/schema.sql's comment on
  // device_location_history for the full reasoning (this used to live in
  // pc-agent/database.py; moved server-side so the agent doesn't need to
  // manage its own dedup state).
  if (public_ip) {
    const last = await pool.query(
      `select ip_address from public.device_location_history where computer_id = $1 order by recorded_at desc limit 1`,
      [row.id],
    );
    if (last.rows[0]?.ip_address !== public_ip) {
      await pool.query(
        `insert into public.device_location_history (computer_id, computer_code, ip_address, local_ip_address)
         values ($1, $2, $3, $4)`,
        [row.id, row.computer_code, public_ip, ip_address ?? null],
      );
    }
  }

  res.json({ ok: true });
});

agentRouter.get('/commands', async (req, res) => {
  const computerCode = req.query.computer_code;
  if (typeof computerCode !== 'string') {
    res.status(400).json({ error: 'computer_code query param is required' });
    return;
  }
  const { conflict } = await loadDeviceByCode(req.agentOrganizationId!, computerCode);
  if (conflict) {
    res.status(404).json({ error: 'Device not found for this agent key' });
    return;
  }

  const result = await pool.query(
    `select id, computer_code, command, payload, status, created_at from public.computer_commands
     where computer_code = $1 and status = 'PENDING' order by created_at asc`,
    [computerCode],
  );
  res.json(result.rows);
});

agentRouter.post('/commands/:id/complete', async (req, res) => {
  const { status, result: commandResult } = req.body ?? {};
  if (!['COMPLETED', 'FAILED'].includes(status)) {
    res.status(400).json({ error: 'status must be COMPLETED or FAILED' });
    return;
  }

  // Scope the update through a join back to computers so a valid agent key
  // for org A can't complete/overwrite a command queued for org B's device
  // even if it somehow guessed the command id.
  const result = await pool.query(
    `update public.computer_commands cc set status = $1, result = $2, completed_at = timezone('utc', now())
     from public.computers c
     where cc.id = $3 and cc.computer_code = c.computer_code and c.organization_id = $4
     returning cc.id`,
    [status, commandResult ?? null, req.params.id, req.agentOrganizationId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Command not found for this agent key' });
    return;
  }
  res.json({ ok: true });
});
