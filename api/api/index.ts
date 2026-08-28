// Vercel serverless entrypoint. Vercel's Node runtime treats any file
// under <rootDirectory>/api/ as a function and calls its default export as
// a plain (req, res) handler on each request -- an Express app instance
// already has exactly that shape, so no adapter is needed. vercel.json
// (one directory up) rewrites every path to this one function, and
// Express's own router does the rest of the dispatch internally, same as
// it does for src/index.ts's traditional-server path.
export { app as default } from '../src/app.js';
