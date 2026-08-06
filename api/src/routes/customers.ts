import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import '../types.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get('/', async (req, res) => {
  const result = await pool.query(
    `select id, name, phone, email, id_number, address from public.customers
     where organization_id = $1 order by name asc`,
    [req.user!.organizationId],
  );
  res.json(result.rows);
});

customersRouter.post('/', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const { name, phone } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const result = await pool.query(
    `insert into public.customers (organization_id, name, phone) values ($1, $2, $3)
     returning id, name, phone, email, id_number, address`,
    [req.user!.organizationId, name.trim(), phone || null],
  );
  res.status(201).json(result.rows[0]);
});
