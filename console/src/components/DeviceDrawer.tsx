import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, User, MapPin, ScrollText, Lock, Unlock, RefreshCw, Trash2,
  ShieldAlert, ShieldCheck, ShieldQuestion, Cpu, HardDrive, MemoryStick,
} from 'lucide-react';
import { AuditLogEntry, Customer, Device, LocationHistoryEntry, getAgentStatus } from '../types';
import { AgentStatusBadge, LeaseStatusBadge, SecurityStatusBadge } from './StatusBadge';
import ConfirmDialog from './ConfirmDialog';
import { relativeTime, formatDateTime } from '../format';
import {
  assignCustomer, createCustomer, fetchAuditLog, fetchLocationHistory,
  flagDevice, markRecovered, sendCommand, setLeaseStatus,
} from '../services/devices';

interface DeviceDrawerProps {
  device: Device;
  canManage: boolean;
  isAdmin: boolean;
  customers: Customer[];
  onClose: () => void;
  onChanged: () => void;
  onCustomerCreated: (c: Customer) => void;
}

type FlagKind = 'FLAGGED_LOST' | 'FLAGGED_STOLEN';
type PendingCommand = 'LOCK' | 'UNLOCK' | 'REFRESH' | null;

const DEFAULT_MESSAGE =
  'This device has been reported lost or stolen and has been locked.\nPlease contact the owner to arrange its return.';

function UsageBar({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="flex items-center gap-2">
      <Icon style={{ width: 11, height: 11, color: 'var(--text-low)', flexShrink: 0 }} />
      <span style={{ width: 30, fontSize: '0.5625rem', textTransform: 'uppercase', color: 'var(--text-low)' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--panel-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, background: color, width: `${pct}%` }} />
      </div>
      <span className="dm-nums" style={{ width: 34, textAlign: 'right', fontSize: '0.625rem', color: 'var(--text-mid)' }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function DeviceDrawer({ device, canManage, isAdmin, customers, onClose, onChanged, onCustomerCreated }: DeviceDrawerProps) {
  const [locations, setLocations] = useState<LocationHistoryEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [flagging, setFlagging] = useState<FlagKind | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState(device.recovery_message || DEFAULT_MESSAGE);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [pendingCommand, setPendingCommand] = useState<PendingCommand>(null);
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const agentStatus = getAgentStatus(device.last_seen);
  const flaggedNow = device.security_status === 'FLAGGED_LOST' || device.security_status === 'FLAGGED_STOLEN';

  useEffect(() => {
    setLoadingHistory(true);
    Promise.all([fetchLocationHistory(device.id), fetchAuditLog(device.id)])
      .then(([loc, log]) => {
        setLocations(loc);
        setAuditLog(log);
      })
      .finally(() => setLoadingHistory(false));
  }, [device.id]);

  const withBusy = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleFlagConfirm = () => {
    if (!flagging) return;
    withBusy(async () => {
      await flagDevice(device.id, flagging, recoveryMessage);
      setFlagging(null);
    });
  };

  const handleRecover = () => withBusy(() => markRecovered(device.id));

  const handleLeaseStatusChange = (value: Device['lease_status']) => withBusy(() => setLeaseStatus(device.id, value));

  const handleAssignCustomer = (customerId: string) => withBusy(() => assignCustomer(device.id, customerId || null));

  const handleAddCustomer = () =>
    withBusy(async () => {
      const c = await createCustomer(newCustomerName.trim(), newCustomerPhone.trim());
      onCustomerCreated(c);
      await assignCustomer(device.id, c.id);
      setShowAddCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
    });

  const runCommand = (command: 'LOCK' | 'UNLOCK' | 'REFRESH') => {
    setPendingCommand(command);
    withBusy(() => sendCommand(device.id, command)).finally(() => setPendingCommand(null));
  };

  const runWipe = () => {
    setWipeDialogOpen(false);
    withBusy(() => sendCommand(device.id, 'WIPE', { confirm: true }));
  };

  return (
    <>
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="dm-scrim" style={{ zIndex: 40 }} onClick={onClose} />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          className="dm-drawer"
          style={{ zIndex: 50 }}
          role="dialog"
          aria-label={`${device.computer_name} details`}
        >
          <div style={{ padding: '1.5rem' }}>
            <div className="flex items-start justify-between" style={{ marginBottom: 20 }}>
              <div>
                <h2 className="dm-h1">{device.computer_name}</h2>
                <code style={{ fontSize: '0.7rem', color: 'var(--text-low)', letterSpacing: '0.04em' }}>{device.computer_code}</code>
                <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                  <AgentStatusBadge status={agentStatus} />
                  <LeaseStatusBadge status={device.lease_status} />
                  <SecurityStatusBadge status={device.security_status} />
                </div>
              </div>
              <button onClick={onClose} className="dm-icon-btn" aria-label="Close">
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)', marginBottom: 16 }} role="alert">
                {error}
              </div>
            )}

            {/* ---- Live metrics ---- */}
            {(device.cpu_usage != null || device.ram_usage != null || device.disk_usage != null || device.ip_address) && (
              <div className="dm-card-inset space-y-2" style={{ padding: '0.85rem', marginBottom: 16 }}>
                <span className="dm-label">Live metrics</span>
                {device.cpu_usage != null && <UsageBar label="CPU" value={device.cpu_usage} icon={Cpu} />}
                {device.ram_usage != null && <UsageBar label="RAM" value={device.ram_usage} icon={MemoryStick} />}
                {device.disk_usage != null && <UsageBar label="Disk" value={device.disk_usage} icon={HardDrive} />}
                <div className="flex justify-between" style={{ fontSize: '0.6875rem', color: 'var(--text-low)', paddingTop: 4 }}>
                  <span className="dm-truncate">{device.hostname || '—'}</span>
                  <span className="dm-nums">{device.ip_address || '—'}</span>
                </div>
              </div>
            )}

            {/* ---- Customer ---- */}
            <section style={{ marginBottom: 20 }}>
              <span className="dm-label flex items-center gap-1.5"><User style={{ width: 11, height: 11 }} /> Assigned to (optional)</span>
              <div className="dm-card-inset" style={{ padding: '0.85rem', marginTop: 8 }}>
                {device.customers ? (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{device.customers.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginTop: 2 }}>
                      {[device.customers.phone, device.customers.email].filter(Boolean).join(' · ') || 'No contact on file'}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-low)' }}>
                    Not assigned to anyone — fine for a personally- or business-owned device with no separate holder.
                  </p>
                )}

                {canManage && !showAddCustomer && (
                  <div className="flex gap-2" style={{ marginTop: 10 }}>
                    <select
                      className="dm-select"
                      style={{ fontSize: '0.8rem', minHeight: 36 }}
                      value={device.customer_id || ''}
                      onChange={(e) => handleAssignCustomer(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">— Unassigned —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button className="dm-btn dm-btn-ghost" style={{ minHeight: 36, padding: '0 0.75rem', fontSize: '0.75rem' }} onClick={() => setShowAddCustomer(true)}>
                      New
                    </button>
                  </div>
                )}

                {canManage && showAddCustomer && (
                  <div className="space-y-2" style={{ marginTop: 10 }}>
                    <input className="dm-input" style={{ minHeight: 36, fontSize: '0.8rem' }} placeholder="Customer name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                    <input className="dm-input" style={{ minHeight: 36, fontSize: '0.8rem' }} placeholder="Phone (optional)" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="dm-btn dm-btn-ghost flex-1" style={{ minHeight: 34, fontSize: '0.75rem' }} onClick={() => setShowAddCustomer(false)}>Cancel</button>
                      <button className="dm-btn dm-btn-primary flex-1" style={{ minHeight: 34, fontSize: '0.75rem' }} disabled={!newCustomerName.trim() || busy} onClick={handleAddCustomer}>
                        Add &amp; assign
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ---- Lease status ---- */}
            {canManage && (
              <section style={{ marginBottom: 20 }}>
                <span className="dm-label">
                  Assignment status <span style={{ opacity: 0.6, textTransform: 'none' }}>(only matters if this device is leased or issued to someone)</span>
                </span>
                <select
                  className="dm-select"
                  style={{ marginTop: 8 }}
                  value={device.lease_status}
                  onChange={(e) => handleLeaseStatusChange(e.target.value as Device['lease_status'])}
                  disabled={busy}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="RETURNED">Returned</option>
                  <option value="DEFAULTED">Defaulted</option>
                </select>
              </section>
            )}

            {/* ---- Theft prevention ---- */}
            <section style={{ marginBottom: 20 }}>
              <span className="dm-label flex items-center gap-1.5"><ShieldAlert style={{ width: 11, height: 11 }} /> Theft prevention</span>

              {device.recovery_message && (
                <div className="dm-card-inset" style={{ padding: '0.75rem', marginTop: 8, fontSize: '0.75rem', color: 'var(--text-mid)', whiteSpace: 'pre-wrap' }}>
                  {device.recovery_message}
                </div>
              )}

              {canManage && flagging && (
                <div className="dm-card-inset space-y-2" style={{ padding: '0.85rem', marginTop: 8 }}>
                  <span className="dm-label" style={{ padding: 0 }}>Recovery message shown on the device</span>
                  <textarea className="dm-textarea" value={recoveryMessage} onChange={(e) => setRecoveryMessage(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="dm-btn dm-btn-ghost flex-1" style={{ minHeight: 36, fontSize: '0.78rem' }} onClick={() => setFlagging(null)}>Cancel</button>
                    <button className="dm-btn dm-btn-danger-solid flex-1" style={{ minHeight: 36, fontSize: '0.78rem' }} disabled={busy} onClick={handleFlagConfirm}>
                      Confirm {flagging === 'FLAGGED_STOLEN' ? 'stolen' : 'lost'} flag
                    </button>
                  </div>
                </div>
              )}

              {canManage && !flagging && (
                <div className="grid grid-cols-2 gap-2" style={{ marginTop: 8 }}>
                  <button className="dm-btn dm-btn-ghost" style={{ fontSize: '0.78rem' }} disabled={busy} onClick={() => { setFlagging('FLAGGED_LOST'); setRecoveryMessage(device.recovery_message || DEFAULT_MESSAGE); }}>
                    <ShieldQuestion style={{ width: 14, height: 14 }} /> Flag lost
                  </button>
                  <button className="dm-btn dm-btn-danger" style={{ fontSize: '0.78rem' }} disabled={busy} onClick={() => { setFlagging('FLAGGED_STOLEN'); setRecoveryMessage(device.recovery_message || DEFAULT_MESSAGE); }}>
                    <ShieldAlert style={{ width: 14, height: 14 }} /> Flag stolen
                  </button>
                </div>
              )}

              {canManage && flaggedNow && !flagging && (
                <button className="dm-btn dm-btn-primary" style={{ width: '100%', marginTop: 8, fontSize: '0.78rem' }} disabled={busy} onClick={handleRecover}>
                  <ShieldCheck style={{ width: 14, height: 14 }} /> Mark recovered
                </button>
              )}

              {flaggedNow && (
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-low)', marginTop: 6 }}>
                  The agent re-locks this device on every poll while flagged — it will keep re-locking even if unlocked at the machine, until marked recovered.
                </p>
              )}
            </section>

            {/* ---- Commands ---- */}
            {canManage && (
              <section style={{ marginBottom: 20 }}>
                <span className="dm-label">Remote commands</span>
                <div className="grid grid-cols-3 gap-2" style={{ marginTop: 8 }}>
                  <button className="dm-btn dm-btn-ghost" style={{ fontSize: '0.72rem', padding: '0 0.5rem' }} disabled={busy} onClick={() => runCommand('LOCK')}>
                    <Lock style={{ width: 12, height: 12 }} /> {pendingCommand === 'LOCK' ? 'Locking…' : 'Lock'}
                  </button>
                  <button className="dm-btn dm-btn-ghost" style={{ fontSize: '0.72rem', padding: '0 0.5rem' }} disabled={busy} onClick={() => runCommand('UNLOCK')}>
                    <Unlock style={{ width: 12, height: 12 }} /> {pendingCommand === 'UNLOCK' ? 'Sending…' : 'Unlock'}
                  </button>
                  <button className="dm-btn dm-btn-ghost" style={{ fontSize: '0.72rem', padding: '0 0.5rem' }} disabled={busy} onClick={() => runCommand('REFRESH')}>
                    <RefreshCw style={{ width: 12, height: 12 }} /> {pendingCommand === 'REFRESH' ? 'Sending…' : 'Refresh'}
                  </button>
                </div>
                <button
                  className="dm-btn dm-btn-danger"
                  style={{ width: '100%', marginTop: 8, fontSize: '0.78rem' }}
                  disabled={busy || !flaggedNow}
                  title={!flaggedNow ? 'The agent refuses to wipe unless the device is flagged lost/stolen' : undefined}
                  onClick={() => setWipeDialogOpen(true)}
                >
                  <Trash2 style={{ width: 14, height: 14 }} /> Wipe device
                </button>
                {!flaggedNow && (
                  <p style={{ fontSize: '0.6875rem', color: 'var(--text-low)', marginTop: 6 }}>
                    Flag this device lost or stolen first — the agent independently refuses to wipe an unflagged device.
                  </p>
                )}
              </section>
            )}

            {/* ---- Location history ---- */}
            <section style={{ marginBottom: 20 }}>
              <span className="dm-label flex items-center gap-1.5"><MapPin style={{ width: 11, height: 11 }} /> Location history (IP)</span>
              <div className="space-y-3" style={{ marginTop: 10 }}>
                {loadingHistory ? (
                  <div className="dm-skeleton" style={{ height: 60 }} />
                ) : locations.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-low)' }}>No location history yet.</p>
                ) : (
                  locations.map((l) => (
                    <div key={l.id} className="dm-timeline-item">
                      <div className="flex items-center justify-between">
                        <span className="dm-nums" style={{ fontSize: '0.78rem', color: 'var(--text-hi)' }}>{l.ip_address}</span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-low)' }}>{relativeTime(l.recorded_at)}</span>
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-low)' }}>{formatDateTime(l.recorded_at)}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* ---- Audit log ---- */}
            <section>
              <span className="dm-label flex items-center gap-1.5"><ScrollText style={{ width: 11, height: 11 }} /> Audit log{!isAdmin && ' (admins only)'}</span>
              <div className="space-y-3" style={{ marginTop: 10 }}>
                {loadingHistory ? (
                  <div className="dm-skeleton" style={{ height: 60 }} />
                ) : auditLog.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-low)' }}>{isAdmin ? 'No audit events yet.' : 'Only admins can view the audit log.'}</p>
                ) : (
                  auditLog.map((entry) => (
                    <div key={entry.id} className="dm-timeline-item">
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-hi)', fontWeight: 600 }}>
                          {entry.event === 'COMMAND_ISSUED' ? `Command: ${(entry.detail as any)?.command}` : 'Status changed'}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-low)' }}>{relativeTime(entry.created_at)}</span>
                      </div>
                      {entry.event === 'STATUS_CHANGED' && (
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-mid)' }}>
                          {(entry.detail as any)?.security_status_from} → {(entry.detail as any)?.security_status_to}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog
        open={wipeDialogOpen}
        title="Wipe this device?"
        description={`This permanently deletes personal-data folders (Desktop, Documents, Downloads, Pictures, Videos, Music) on ${device.computer_name}. This cannot be undone.`}
        confirmLabel="Wipe device"
        danger
        requireTypedConfirmation={device.computer_code}
        submitting={busy}
        onConfirm={runWipe}
        onCancel={() => setWipeDialogOpen(false)}
      />
    </>
  );
}
