import Stripe from 'stripe';
import { env } from '../env.js';

let _stripe: Stripe | null = null;

// Lazily constructed (and only once) rather than at module load, so
// importing this file doesn't crash the whole server on boot when Stripe
// isn't configured yet -- only requests that actually hit /billing/* do.
export function stripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set -- billing routes are unavailable until it is.');
  }
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: '2025-02-24.acacia' });
  }
  return _stripe;
}
