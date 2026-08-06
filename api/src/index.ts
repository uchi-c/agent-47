import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { devicesRouter } from './routes/devices.js';
import { customersRouter } from './routes/customers.js';
import { agentRouter } from './routes/agent.js';
import { billingRouter } from './routes/billing.js';

const app = express();

app.use(cors({ origin: env.consoleOrigin }));

// The webhook route needs the raw request body (Buffer) to verify Stripe's
// signature -- it must be registered with express.raw() BEFORE the global
// express.json() below, or Express would parse-then-reserialize the body
// and Stripe's signature (computed over the original bytes) would never
// match.
app.use('/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/devices', devicesRouter);
app.use('/customers', customersRouter);
app.use('/agent', agentRouter);
app.use('/billing', billingRouter);

// Last-resort handler so an unexpected thrown error becomes a 500 JSON
// response instead of Express's default HTML error page (which the
// console's fetch-based client can't parse as JSON) or a silently hung
// request.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`device-guard-api listening on :${env.port}`);
});
