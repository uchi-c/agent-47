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
