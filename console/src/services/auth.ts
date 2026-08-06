import { api, clearToken, setToken } from '../apiClient';
import { Organization } from '../types';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  organizationId: string;
}

export function fetchMe(): Promise<{ user: Profile; organization: Organization }> {
  return api.get('/auth/me');
}

export async function signIn(email: string, password: string): Promise<void> {
  const { token } = await api.post<{ token: string }>('/auth/login', { email, password });
  setToken(token);
}

// Signup is a single atomic call now (api/src/routes/auth.ts creates the
// org + user + membership in one transaction and returns a token right
// away) -- there's no separate "confirm your email, then finish setting
// up" step the way Supabase Auth's optional email confirmation used to
// require.
export async function signUp(email: string, password: string, name: string, orgName: string): Promise<void> {
  const { token } = await api.post<{ token: string }>('/auth/signup', { email, password, name, orgName });
  setToken(token);
}

export function signOut(): void {
  clearToken();
}
