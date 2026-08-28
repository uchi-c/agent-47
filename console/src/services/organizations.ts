import { api } from '../apiClient';

// organization_id is never passed in the request body -- api/'s
// requireAuth middleware derives it from the caller's JWT, so there's
// nothing here to trick into acting on a different organization.
async function invokeBilling(path: 'checkout-session' | 'portal-session'): Promise<string> {
  const { url } = await api.post<{ url: string }>(`/billing/${path}`);
  return url;
}

export const startCheckout = () => invokeBilling('checkout-session');
export const openBillingPortal = () => invokeBilling('portal-session');

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
