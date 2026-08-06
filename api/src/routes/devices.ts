import { Request, Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import '../types.js';

export const devicesRouter = Router();
devicesRouter.use(requireAuth);

// Express 5's Request['params'] types each value as `string | string[]` (to
// accommodate path-to-regexp's repeated-param syntax, e.g. "/:id+"), even
// though none of the routes below use that syntax and deviceId(req) is
// always a single string at runtime. Centralizing the cast here means it's
// asserted once, not at every call site.
function deviceId(req: Request): string {
  return req.params.id as string;
}

const DEVICE_SELECT = `
  c.id, c.organization_id, c.computer_name, c.computer_code, c.hostname, c.ip_address,
  c.cpu_usage, c.ram_usage, c.disk_usage, c.last_seen, c.created_at,
  c.customer_id, c.lease_status, c.security_status, c.recovery_message,
  c.flagged_at, c.flagged_by, c.recovered_at, c.wiped_at,
  case when cu.id is null then null else json_build_object(
    'id', cu.id, 'name', cu.name, 'phone', cu.phone, 'email', cu.email,
    'id_number', cu.id_number, 'address', cu.address
  ) end as customers
`;

// Every route below trusts nothing about which device it's touching beyond
// "id = $1 and organization_id = req.user.organizationId" -- a device from
// another org returns 404, identical to a nonexistent id, rather than 403
// (which would confirm the id exists in someone else's account).

devicesRouter.get('/', async (req, res) => {
  const result = await pool.query(
    `select ${DEVICE_SELECT} from public.computers c left join public.customers cu on cu.id = c.customer_id
     where c.organization_id = $1 order by c.computer_name asc`,
    [req.user!.organizationId],
  );
  res.json(result.rows);
});

async function loadDevice(organizationId: string, deviceId: string) {
  const result = await pool.query(
    `select ${DEVICE_SELECT} from public.computers c left join public.customers cu on cu.id = c.customer_id
     where c.id = $1 and c.organization_id = $2`,
    [deviceId, organizationId],
  );
  return result.rows[0] ?? null;
}

devicesRouter.get('/:id', async (req, res) => {
  const device = await loadDevice(req.user!.organizationId, deviceId(req));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json(device);
});

devicesRouter.patch('/:id/customer', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const { customer_id } = req.body ?? {};
  const result = await pool.query(
    `update public.computers set customer_id = $1, updated_by = $2
     where id = $3 and organization_id = $4 returning id`,
    [customer_id || null, req.user!.id, deviceId(req), req.user!.organizationId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json(await loadDevice(req.user!.organizationId, deviceId(req)));
});

devicesRouter.patch('/:id/lease-status', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const { lease_status } = req.body ?? {};
  if (!['ACTIVE', 'RETURNED', 'DEFAULTED'].includes(lease_status)) {
    res.status(400).json({ error: 'Invalid lease_status' });
    return;
  }
  const result = await pool.query(
    `update public.computers set lease_status = $1, updated_by = $2
     where id = $3 and organization_id = $4 returning id`,
    [lease_status, req.user!.id, deviceId(req), req.user!.organizationId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json(await loadDevice(req.user!.organizationId, deviceId(req)));
});

devicesRouter.post('/:id/flag', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const { security_status, recovery_message } = req.body ?? {};
  if (!['FLAGGED_LOST', 'FLAGGED_STOLEN'].includes(security_status)) {
    res.status(400).json({ error: 'security_status must be FLAGGED_LOST or FLAGGED_STOLEN' });
    return;
  }
  const result = await pool.query(
    `update public.computers
     set security_status = $1, recovery_message = $2, flagged_at = timezone('utc', now()), flagged_by = $3, updated_by = $3
     where id = $4 and organization_id = $5 returning id`,
    [security_status, recovery_message ?? null, req.user!.id, deviceId(req), req.user!.organizationId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json(await loadDevice(req.user!.organizationId, deviceId(req)));
});

devicesRouter.post('/:id/recover', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const result = await pool.query(
    `update public.computers
     set security_status = 'RECOVERED', recovered_at = timezone('utc', now()), updated_by = $1
     where id = $2 and organization_id = $3 returning id`,
    [req.user!.id, deviceId(req), req.user!.organizationId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json(await loadDevice(req.user!.organizationId, deviceId(req)));
});

devicesRouter.post('/:id/commands', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const { command, payload } = req.body ?? {};
  if (!['LOCK', 'UNLOCK', 'WIPE', 'REFRESH'].includes(command)) {
    res.status(400).json({ error: 'Invalid command' });
    return;
  }
  if (command === 'WIPE' && payload?.confirm !== true) {
    res.status(400).json({ error: 'WIPE requires payload.confirm === true' });
    return;
  }

  const device = await loadDevice(req.user!.organizationId, deviceId(req));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  await pool.query(
    `insert into public.computer_commands (computer_code, command, payload, created_by) values ($1, $2, $3, $4)`,
    [device.computer_code, command, payload ?? null, req.user!.id],
  );
  res.status(201).json({ ok: true });
});

devicesRouter.get('/:id/location-history', async (req, res) => {
  const device = await loadDevice(req.user!.organizationId, deviceId(req));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  const result = await pool.query(
    `select id, computer_id, ip_address, local_ip_address, recorded_at from public.device_location_history
     where computer_id = $1 order by recorded_at desc limit 25`,
    [device.id],
  );
  res.json(result.rows);
});

devicesRouter.get('/:id/audit-log', requireRole('ADMIN'), async (req, res) => {
  const device = await loadDevice(req.user!.organizationId, deviceId(req));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  const result = await pool.query(
    `select id, computer_id, event, detail, actor, created_at from public.computer_audit_log
     where computer_id = $1 order by created_at desc limit 25`,
    [device.id],
  );
  res.json(result.rows);
});
