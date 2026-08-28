import { app } from './app.js';
import { env } from './env.js';

// Traditional long-running server entrypoint -- used locally (npm run dev)
// and on any host that runs `node dist/index.js` directly (a VM, Fly.io,
// Render, etc). NOT used on Vercel -- see api/index.ts, which imports the
// same app.js but skips this listener entirely.
app.listen(env.port, () => {
  console.log(`device-guard-api listening on :${env.port}`);
});
