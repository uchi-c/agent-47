export type LeaseStatus = 'ACTIVE' | 'RETURNED' | 'DEFAULTED';
export type SecurityStatus = 'NORMAL' | 'FLAGGED_LOST' | 'FLAGGED_STOLEN' | 'RECOVERED';
export type CommandType = 'LOCK' | 'UNLOCK' | 'WIPE' | 'REFRESH';
export type CommandStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

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
