export type LeaseStatus = 'ACTIVE' | 'RETURNED' | 'DEFAULTED';
export type SecurityStatus = 'NORMAL' | 'FLAGGED_LOST' | 'FLAGGED_STOLEN' | 'RECOVERED';
export type CommandType = 'LOCK' | 'UNLOCK' | 'WIPE' | 'REFRESH';
export type CommandStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export type Plan = 'trial' | 'personal' | 'business';

export interface Organization {
  id: string;
  name: string;
  plan: Plan;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string;
  stripe_customer_id: string | null;
}

// Keep in sync with api/src/routes/agent.ts's PERSONAL_PLAN_DEVICE_LIMIT --
// shown here so the console can warn before an install fails, not just
// after.
export const PERSONAL_PLAN_DEVICE_LIMIT = 3;

// True if the org currently has standing access to the console -- either a
// paid subscription in good standing, or an unexpired trial. Kept as one
// function so App.tsx and Console.tsx's trial banner can never disagree
// about what "still has access" means.
export function hasAccess(org: Organization): boolean {
  if (org.subscription_status === 'ACTIVE') return true;
  if (org.subscription_status === 'TRIALING') return new Date(org.trial_ends_at).getTime() > Date.now();
  return false;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  id_number: string | null;
  address: string | null;
}

export interface Device {
  id: string;
  organization_id: string;
  computer_name: string;
  computer_code: string;
  hostname: string | null;
  ip_address: string | null;
  cpu_usage: number | null;
  ram_usage: number | null;
  disk_usage: number | null;
  last_seen: string | null;
  created_at: string;
  customer_id: string | null;
  lease_status: LeaseStatus;
  security_status: SecurityStatus;
  recovery_message: string | null;
  flagged_at: string | null;
  flagged_by: string | null;
  recovered_at: string | null;
  wiped_at: string | null;
  // Embedded via the customers(...) select — one row, not an array, despite
  // PostgREST's join shape, because customer_id is a to-one FK.
  customers: Customer | null;
}

export interface LocationHistoryEntry {
  id: string;
  computer_id: string;
  ip_address: string;
  local_ip_address: string | null;
  recorded_at: string;
}

export interface AuditLogEntry {
  id: string;
  computer_id: string;
  event: 'STATUS_CHANGED' | 'COMMAND_ISSUED';
  detail: Record<string, unknown> | null;
  actor: string | null;
  created_at: string;
}

export type AgentStatus = 'ONLINE' | 'STANDBY' | 'OFFLINE';

export function getAgentStatus(lastSeen: string | null): AgentStatus {
  if (!lastSeen) return 'OFFLINE';
  const secondsAgo = Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000));
  if (secondsAgo < 60) return 'ONLINE';
  if (secondsAgo <= 120) return 'STANDBY';
  return 'OFFLINE';
}
