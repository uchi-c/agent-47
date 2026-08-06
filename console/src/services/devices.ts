import { supabase } from '../supabase';
import { AuditLogEntry, CommandType, Customer, Device, LocationHistoryEntry, LeaseStatus, SecurityStatus } from '../types';

const DEVICE_SELECT = '*, customers(id, name, phone, email, id_number, address)';

export async function fetchDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from('computers')
    .select(DEVICE_SELECT)
    .order('computer_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Device[];
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, email, id_number, address')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function createCustomer(name: string, phone: string): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert([{ name, phone: phone || null }])
    .select('id, name, phone, email, id_number, address')
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function assignCustomer(deviceId: string, customerId: string | null): Promise<void> {
  const { error } = await supabase.from('computers').update({ customer_id: customerId }).eq('id', deviceId);
  if (error) throw error;
}

export async function setLeaseStatus(deviceId: string, leaseStatus: LeaseStatus): Promise<void> {
  const { error } = await supabase.from('computers').update({ lease_status: leaseStatus }).eq('id', deviceId);
  if (error) throw error;
}

export async function flagDevice(
  deviceId: string,
  securityStatus: Extract<SecurityStatus, 'FLAGGED_LOST' | 'FLAGGED_STOLEN'>,
  recoveryMessage: string,
  actorUserId: string,
): Promise<void> {
  const { error } = await supabase
    .from('computers')
    .update({
      security_status: securityStatus,
      recovery_message: recoveryMessage,
      flagged_at: new Date().toISOString(),
      flagged_by: actorUserId,
    })
    .eq('id', deviceId);
  if (error) throw error;
}

export async function markRecovered(deviceId: string): Promise<void> {
  const { error } = await supabase
    .from('computers')
    .update({ security_status: 'RECOVERED', recovered_at: new Date().toISOString() })
    .eq('id', deviceId);
  if (error) throw error;
}

// Queues a remote command for the device's agent to pick up on its next
// poll (~2s) and execute -- see pc-agent/command_manager.py. WIPE requires
// payload.confirm === true; the database also enforces this via a CHECK
// constraint (computer_commands_wipe_requires_confirm), so this is
// defense-in-depth, not the only guard.
export async function sendCommand(
  computerCode: string,
  command: CommandType,
  payload?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('computer_commands').insert([{ computer_code: computerCode, command, payload: payload ?? null }]);
  if (error) throw error;
}

export async function fetchLocationHistory(deviceId: string, limit = 25): Promise<LocationHistoryEntry[]> {
  const { data, error } = await supabase
    .from('device_location_history')
    .select('*')
    .eq('computer_id', deviceId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LocationHistoryEntry[];
}

// ADMIN-only per RLS (see database/migrations/001_leasing_theft_prevention.sql)
// -- returns an empty list rather than throwing for STAFF, so the UI can
// just show "nothing to show" instead of surfacing a permissions error for
// an expected, role-gated read.
export async function fetchAuditLog(deviceId: string, limit = 25): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('computer_audit_log')
    .select('*')
    .eq('computer_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as AuditLogEntry[];
}
