import { api } from '../apiClient';

// organization_id is never passed in the request body -- api/'s
// requireAuth middleware derives it from the caller's JWT, so there's
// nothing here to trick into acting on a different organization.
async function invokeBilling(path: 'checkout-session' | 'portal-session', body?: unknown): Promise<string> {
  const { url } = await api.post<{ url: string }>(`/billing/${path}`, body);
  return url;
}

export const startCheckout = (plan: 'personal' | 'business') => invokeBilling('checkout-session', { plan });
export const openBillingPortal = () => invokeBilling('portal-session');

export interface PlanPrice {
  amount: number;
  currency: string;
  interval: string;
}

export interface Plans {
  personal: PlanPrice | null;
  business: PlanPrice | null;
}

// Real Stripe prices, not hardcoded copy -- see api/src/routes/billing.ts's
// GET /plans for why. A null entry means that plan's Stripe price id isn't
// configured yet; the picker falls back to generic copy for it.
export const fetchPlans = () => api.get<Plans>('/billing/plans');

// The pc-agent fleet credential -- ADMIN-only on the API side too (see
// api/src/routes/organizations.ts). Never cached outside this call; the
// drawer that shows it re-fetches every time it opens rather than holding
// it in longer-lived state.
export async function fetchAgentKey(): Promise<string> {
  const { agent_api_key } = await api.get<{ agent_api_key: string }>('/organizations/agent-key');
  return agent_api_key;
}

// Immediately invalidates every already-installed agent's credential for
// this org -- the caller is responsible for warning about that before
// calling this, not just after (see ConnectDeviceDrawer.tsx).
export async function rotateAgentKey(): Promise<string> {
  const { agent_api_key } = await api.post<{ agent_api_key: string }>('/organizations/agent-key/rotate');
  return agent_api_key;
}
