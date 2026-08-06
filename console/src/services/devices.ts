import { api, ApiError } from '../apiClient';
import { AuditLogEntry, CommandType, Customer, Device, LocationHistoryEntry, LeaseStatus, SecurityStatus } from '../types';

export const fetchDevices = () => api.get<Device[]>('/devices');

export const fetchCustomers = () => api.get<Customer[]>('/customers');

export const createCustomer = (name: string, phone: string) => api.post<Customer>('/customers', { name, phone });

export const assignCustomer = (deviceId: string, customerId: string | null) =>
  api.patch<Device>(`/devices/${deviceId}/customer`, { customer_id: customerId });

export const setLeaseStatus = (deviceId: string, leaseStatus: LeaseStatus) =>
  api.patch<Device>(`/devices/${deviceId}/lease-status`, { lease_status: leaseStatus });

export const flagDevice = (
  deviceId: string,
  securityStatus: Extract<SecurityStatus, 'FLAGGED_LOST' | 'FLAGGED_STOLEN'>,
  recoveryMessage: string,
) => api.post<Device>(`/devices/${deviceId}/flag`, { security_status: securityStatus, recovery_message: recoveryMessage });

export const markRecovered = (deviceId: string) => api.post<Device>(`/devices/${deviceId}/recover`);

// Queues a remote command for the device's agent to pick up on its next
// poll (~2s) and execute -- see pc-agent/command_manager.py. WIPE requires
// payload.confirm === true; the database also enforces this via a CHECK
// constraint, and api/'s route checks it too, so this is defense-in-depth
// at three layers, not the only guard.
export const sendCommand = (deviceId: string, command: CommandType, payload?: Record<string, unknown>) =>
  api.post(`/devices/${deviceId}/commands`, { command, payload });

export const fetchLocationHistory = (deviceId: string) => api.get<LocationHistoryEntry[]>(`/devices/${deviceId}/location-history`);

// ADMIN-only in api/ (returns 403 for STAFF) -- caught here and turned into
// an empty list, so the UI can just show "nothing to show" instead of
// surfacing a permissions error for an expected, role-gated read.
export async function fetchAuditLog(deviceId: string): Promise<AuditLogEntry[]> {
  try {
    return await api.get<AuditLogEntry[]>(`/devices/${deviceId}/audit-log`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return [];
    throw err;
  }
}
