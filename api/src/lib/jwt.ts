import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface TokenPayload {
  sub: string; // user id
}

// Long-lived on purpose: there's no refresh-token rotation in this MVP, so
// a short expiry would just log people out with no way back in short of
// signing in again. Revisit if session hijacking risk needs tightening --
// the mitigation then is a shorter expiry plus a refresh flow, not
// something to half-build here.
const EXPIRES_IN = '30d';

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.jwtSecret, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
