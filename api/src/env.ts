import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing in the environment (see .env.example)`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  consoleOrigin: (process.env.CONSOLE_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  port: Number(process.env.PORT ?? 8080),

  // Billing is optional -- absent, /billing/* routes fail loudly rather
  // than silently doing nothing, but the rest of the API (auth, devices,
  // agent) works fine without Stripe configured.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripePriceId: process.env.STRIPE_PRICE_ID,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
};
