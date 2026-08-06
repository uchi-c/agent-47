import { Router } from 'express';
import Stripe from 'stripe';
import { pool } from '../db.js';
import { env } from '../env.js';
import { stripe } from '../lib/stripe.js';
import { requireAuth } from '../middleware/requireAuth.js';
import '../types.js';

export const billingRouter = Router();

// Unlike the checkout-session/create-portal-session pair below, this
// doesn't take requireAuth or an organization_id from the request body at
// all -- req.user.organizationId comes straight from the caller's verified
// JWT, so there's nothing to double-check the way the old Supabase Edge
// Function had to (there, the JWT and the RLS-scoped query were two
// separate steps; here requireAuth already IS that check).
billingRouter.post('/checkout-session', requireAuth, async (req, res) => {
  if (!env.stripePriceId) {
    res.status(500).json({ error: 'Billing is not configured (STRIPE_PRICE_ID missing)' });
    return;
  }

  const orgResult = await pool.query('select id, stripe_customer_id from public.organizations where id = $1', [req.user!.organizationId]);
  const org = orgResult.rows[0];

  let customerId: string | null = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe().customers.create({ metadata: { organization_id: org.id } });
    customerId = customer.id;
    await pool.query('update public.organizations set stripe_customer_id = $1 where id = $2', [customerId, org.id]);
  }

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: env.stripePriceId, quantity: 1 }],
    client_reference_id: org.id,
    metadata: { organization_id: org.id },
    subscription_data: { metadata: { organization_id: org.id } },
    success_url: `${env.appUrl}/?checkout=success`,
    cancel_url: `${env.appUrl}/?checkout=cancelled`,
  });

  res.json({ url: session.url });
});

billingRouter.post('/portal-session', requireAuth, async (req, res) => {
  const orgResult = await pool.query('select stripe_customer_id from public.organizations where id = $1', [req.user!.organizationId]);
  const customerId = orgResult.rows[0]?.stripe_customer_id;
  if (!customerId) {
    res.status(400).json({ error: 'This organization has no billing account yet -- subscribe first.' });
    return;
  }

  const session = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${env.appUrl}/` });
  res.json({ url: session.url });
});

// Stripe subscription statuses -> our organizations.subscription_status.
// Anything unlisted (e.g. 'incomplete_expired') falls back to CANCELED --
// none of those states should leave an org with standing access.
const STATUS_MAP: Record<string, string> = {
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  incomplete: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete_expired: 'CANCELED',
  paused: 'CANCELED',
};

// Mounted with express.raw() in index.ts (NOT express.json()) -- Stripe's
// signature verification needs the exact raw request bytes, and re-
// serializing a parsed JSON body would not reproduce them byte-for-byte.
billingRouter.post('/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!env.stripeWebhookSecret || typeof signature !== 'string') {
    res.status(400).send('Missing signature or webhook secret not configured');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(req.body as Buffer, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error('[billing/webhook] signature verification failed', err);
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organization_id ?? (session.client_reference_id as string | null);
        if (organizationId && session.subscription) {
          await pool.query(
            `update public.organizations set subscription_status = 'ACTIVE', plan = 'standard', stripe_customer_id = $1, stripe_subscription_id = $2 where id = $3`,
            [
              typeof session.customer === 'string' ? session.customer : session.customer?.id,
              typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
              organizationId,
            ],
          );
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const status = event.type === 'customer.subscription.deleted' ? 'CANCELED' : (STATUS_MAP[subscription.status] ?? 'CANCELED');
        const organizationId = subscription.metadata?.organization_id;
        if (organizationId) {
          await pool.query('update public.organizations set subscription_status = $1 where id = $2', [status, organizationId]);
        } else {
          await pool.query('update public.organizations set subscription_status = $1 where stripe_subscription_id = $2', [status, subscription.id]);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] failed handling ${event.type}`, err);
    res.status(500).send('Webhook handler error');
    return;
  }

  res.json({ received: true });
});
