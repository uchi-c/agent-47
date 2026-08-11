import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../db.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/requireAuth.js';
import '../types.js';

export const authRouter = Router();

const ORG_SELECT = 'id, name, plan, subscription_status, trial_ends_at, stripe_customer_id';

// Self-serve signup: creates the organization (30-day trial), the user
// (role ADMIN of their own brand-new org), and the membership linking them,
// atomically. There's no email-confirmation step -- Neon has no bundled
// auth/email sending the way Supabase did, and building a transactional
// email flow just for this is out of scope; the account is active
// immediately on signup.
authRouter.post('/signup', async (req, res) => {
  const { email, password, name, orgName } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || typeof orgName !== 'string') {
    res.status(400).json({ error: 'email, password, name, and orgName are all required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (!orgName.trim() || !name.trim()) {
    res.status(400).json({ error: 'name and orgName cannot be blank' });
    return;
  }

  const existing = await pool.query('select 1 from public.users where email = $1', [email.trim().toLowerCase()]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'An account with that email already exists' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const userId = await withTransaction(async (client) => {
    const org = await client.query(
      `insert into public.organizations (name, plan, subscription_status, trial_ends_at)
       values ($1, 'trial', 'TRIALING', timezone('utc', now()) + interval '30 days')
       returning id`,
      [orgName.trim()],
    );
    const orgId = org.rows[0].id;

    const user = await client.query(
      `insert into public.users (name, email, password_hash, role)
       values ($1, $2, $3, 'ADMIN')
       returning id`,
      [name.trim(), email.trim().toLowerCase(), passwordHash],
    );
    const newUserId = user.rows[0].id;

    await client.query('insert into public.user_organization_memberships (user_id, org_id) values ($1, $2)', [newUserId, orgId]);

    return newUserId;
  });

  const token = signToken(userId);
  res.status(201).json({ token });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const result = await pool.query('select id, password_hash from public.users where email = $1', [email.trim().toLowerCase()]);
  const row = result.rows[0];

  // Constant-shape response whether the email doesn't exist or the
  // password is wrong -- bcrypt.compare against a fixed dummy hash keeps
  // the timing roughly the same as a real check either way, rather than
  // returning instantly for unknown emails and leaking which emails have
  // accounts via response time.
  const hash = row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const valid = await bcrypt.compare(password, hash);

  if (!row || !valid) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }

  const token = signToken(row.id);
  res.json({ token });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const orgResult = await pool.query(`select ${ORG_SELECT} from public.organizations where id = $1`, [req.user!.organizationId]);
  res.json({ user: req.user, organization: orgResult.rows[0] ?? null });
});
